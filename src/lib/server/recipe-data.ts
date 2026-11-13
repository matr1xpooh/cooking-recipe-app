import { mkdir, readFile, rename, rm, writeFile, access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Recipe } from '#lib/recipes/recipe.js';
import { isRecipe, normalizeRecipe } from '#lib/recipes/validate.js';
import { sniffImageType, type ImageType } from '#lib/recipes/screenshot.js';
import { matchByUrl, matchSame } from './recipe-match';

/**
 * Recipes on this machine's disk. The data directory defaults to ./data under the
 * project and can be set with RECIPE_DATA_DIR. Layout:
 *   recipes.json                       all recipes, newest first
 *   images/<recipe id>/<image id>.png|jpg   each recipe's original images
 * A recipe's image list is kept in recipes.json; the files hold the bytes.
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

const IMAGE_EXTENSIONS: Record<ImageType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
const LEGACY_IMAGE = 'legacy';

function recipeImageDir(recipeId: string): string {
	return path.join(dataDir(), 'images', recipeId);
}

/**
 * Moves the single screenshot kept before there were several per recipe into the
 * recipe's folder. Returns true when a file was moved.
 */
async function migrateLegacyImage(recipe: Recipe): Promise<boolean> {
	if (!recipe.images.includes(LEGACY_IMAGE)) return false;
	for (const ext of Object.values(IMAGE_EXTENSIONS)) {
		const old = path.join(dataDir(), 'images', `${recipe.id}.${ext}`);
		try {
			await access(old);
		} catch {
			continue;
		}
		await mkdir(recipeImageDir(recipe.id), { recursive: true });
		await rename(old, path.join(recipeImageDir(recipe.id), `${LEGACY_IMAGE}.${ext}`));
		return true;
	}
	return false;
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
	let recipes: Recipe[];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) throw new Error('not an array');
		recipes = parsed.filter(isRecipe).map((r) => normalizeRecipe(r));
	} catch {
		await rename(file, path.join(dataDir(), `recipes.corrupt-${Date.now()}.json`));
		return [];
	}
	let moved = false;
	for (const recipe of recipes) moved = (await migrateLegacyImage(recipe)) || moved;
	if (moved) await writeAll(recipes);
	return recipes;
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
		// The recipe may now list a picture that is still in the old place: move it.
		for (const r of all) await migrateLegacyImage(r);
		await writeAll(all);
	});
}

/** Removes the recipe and all its images. Returns false when no such recipe exists. */
export function deleteRecipe(id: string): Promise<boolean> {
	return serial(async () => {
		const all = await readAll();
		const remaining = all.filter((r) => r.id !== id);
		if (remaining.length === all.length) return false;
		await writeAll(remaining);
		await rm(recipeImageDir(id), { recursive: true, force: true });
		return true;
	});
}

/** A new id for an image. */
export function newImageId(): string {
	return randomUUID();
}

/** Stores one original image of a recipe. */
export function saveImage(
	recipeId: string,
	imageId: string,
	bytes: Uint8Array,
	type: ImageType
): Promise<void> {
	return serial(async () => {
		const dir = recipeImageDir(recipeId);
		await mkdir(dir, { recursive: true });
		await writeAtomically(path.join(dir, `${imageId}.${IMAGE_EXTENSIONS[type]}`), bytes);
	});
}

/** One original image of a recipe, or null when it is not there. */
export async function readImage(
	recipeId: string,
	imageId: string
): Promise<{ bytes: Uint8Array; type: ImageType } | null> {
	for (const [type, ext] of Object.entries(IMAGE_EXTENSIONS) as [ImageType, string][]) {
		const file = path.join(recipeImageDir(recipeId), `${imageId}.${ext}`);
		try {
			const bytes = new Uint8Array(await readFile(file));
			return sniffImageType(bytes) === type ? { bytes, type } : null;
		} catch {
			continue;
		}
	}
	return null;
}

/** Removes one image file. Missing files are ignored. */
export function deleteImage(recipeId: string, imageId: string): Promise<void> {
	return serial(async () => {
		for (const ext of Object.values(IMAGE_EXTENSIONS)) {
			await rm(path.join(recipeImageDir(recipeId), `${imageId}.${ext}`), { force: true });
		}
	});
}

/**
 * The saved recipe with the same address as `url`, other than `exceptId`. When a start
 * time is given, only a recipe with that start time counts: one video can hold several
 * dishes, each with its own start.
 */
export async function findRecipeByUrl(
	url: string,
	exceptId?: string,
	start?: number | null
): Promise<Recipe | undefined> {
	return matchByUrl(await listRecipes(), url, exceptId, start);
}

/**
 * A saved recipe that is the same dish as `recipe`: same address, same start time and
 * same title. One video can hold several dishes, so the address alone is not enough.
 */
export async function findSameRecipe(recipe: Recipe): Promise<Recipe | undefined> {
	return matchSame(await listRecipes(), recipe);
}
