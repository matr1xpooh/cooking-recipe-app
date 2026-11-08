import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Recipe } from '#lib/recipes/recipe.js';
import { isRecipe, normalizeRecipe } from '#lib/recipes/validate.js';
import { normalizeSourceUrl } from '#lib/recipes/recipe.js';
import { sniffImageType, type ImageType } from '#lib/recipes/screenshot.js';

/**
 * Recipes on this machine's disk. The data directory defaults to ./data under the
 * project and can be set with RECIPE_DATA_DIR. Layout:
 *   recipes.json        all recipes, newest first
 *   images/<id>.png|jpg the original screenshot for a recipe
 */

export function dataDir(): string {
	return process.env.RECIPE_DATA_DIR ?? path.resolve('data');
}

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

export function isSafeId(id: string): boolean {
	return SAFE_ID.test(id);
}

// Writes run one at a time, so two saves can't interleave on the file.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
	const run = queue.then(task);
	queue = run.catch(() => undefined);
	return run;
}

async function writeAtomically(file: string, data: string | Uint8Array): Promise<void> {
	const tmp = `${file}.tmp`;
	await writeFile(tmp, data);
	await rename(tmp, file);
}

/** Reads all recipes. A file that can't be parsed is moved aside, never overwritten. */
async function readAll(): Promise<Recipe[]> {
	const file = path.join(dataDir(), 'recipes.json');
	let raw: string;
	try {
		raw = await readFile(file, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw error;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) throw new Error('not an array');
		return parsed.filter(isRecipe).map(normalizeRecipe);
	} catch {
		await rename(file, path.join(dataDir(), `recipes.corrupt-${Date.now()}.json`));
		return [];
	}
}

async function writeAll(recipes: Recipe[]): Promise<void> {
	await mkdir(dataDir(), { recursive: true });
	await writeAtomically(path.join(dataDir(), 'recipes.json'), JSON.stringify(recipes, null, 2));
}

export function listRecipes(): Promise<Recipe[]> {
	return serial(readAll);
}

/** Adds the recipe at the top, or replaces the one with the same id in place. */
export function saveRecipe(recipe: Recipe): Promise<void> {
	return serial(async () => {
		const all = await readAll();
		const index = all.findIndex((r) => r.id === recipe.id);
		const next = normalizeRecipe(recipe);
		if (index >= 0) all[index] = next;
		else all.unshift(next);
		await writeAll(all);
	});
}

/** Removes the recipe and its screenshot. Returns false when no such recipe exists. */
export function deleteRecipe(id: string): Promise<boolean> {
	return serial(async () => {
		const all = await readAll();
		const remaining = all.filter((r) => r.id !== id);
		if (remaining.length === all.length) return false;
		await writeAll(remaining);
		const dir = path.join(dataDir(), 'images');
		for (const ext of ['png', 'jpg']) {
			await rm(path.join(dir, `${id}.${ext}`), { force: true });
		}
		return true;
	});
}

const IMAGE_EXTENSIONS: Record<ImageType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

/** Stores the screenshot's original bytes, replacing any earlier one for the recipe. */
export function saveImage(id: string, bytes: Uint8Array, type: ImageType): Promise<void> {
	return serial(async () => {
		const dir = path.join(dataDir(), 'images');
		await mkdir(dir, { recursive: true });
		for (const ext of Object.values(IMAGE_EXTENSIONS)) {
			await rm(path.join(dir, `${id}.${ext}`), { force: true });
		}
		await writeAtomically(path.join(dir, `${id}.${IMAGE_EXTENSIONS[type]}`), bytes);
	});
}

/** The stored screenshot for a recipe, or null when there is none. */
export async function readImage(
	id: string
): Promise<{ bytes: Uint8Array; type: ImageType } | null> {
	const dir = path.join(dataDir(), 'images');
	let files: string[];
	try {
		files = await readdir(dir);
	} catch {
		return null;
	}
	for (const [type, ext] of Object.entries(IMAGE_EXTENSIONS) as [ImageType, string][]) {
		if (files.includes(`${id}.${ext}`)) {
			const bytes = new Uint8Array(await readFile(path.join(dir, `${id}.${ext}`)));
			return sniffImageType(bytes) === type ? { bytes, type } : null;
		}
	}
	return null;
}

/** The saved recipe with the same address as `url`, other than `exceptId`, if there is one. */
export async function findRecipeByUrl(url: string, exceptId?: string): Promise<Recipe | undefined> {
	const key = normalizeSourceUrl(url);
	return (await listRecipes()).find(
		(r) => r.id !== exceptId && r.sourceUrl !== null && normalizeSourceUrl(r.sourceUrl) === key
	);
}
