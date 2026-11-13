import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Recipe } from '#lib/recipes/recipe.js';
import type { Language } from '#lib/recipes/languages.js';
import type { ImageType } from '#lib/recipes/screenshot.js';
import type { TranslationOverride } from './translation-overrides';
import { applyMigration, planMigration } from './migrate';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]);

const recipe = (id: string, images: string[]): Recipe => ({
	id,
	title: `Dish ${id}`,
	sourceUrl: null,
	sourceStart: null,
	ingredients: ['water'],
	steps: ['Boil'],
	notes: '',
	images,
	source: 'typed',
	tags: [],
	createdAt: '2026-11-07T10:00:00.000Z',
	archived: false
});

const fields = { title: 'Sopa', ingredients: ['agua'], steps: ['Hervir'], notes: '' };

/** A store that remembers what it was given, keyed the way the real stores key it. */
function memoryTarget() {
	const recipes = new Map<string, Recipe>();
	const images = new Map<string, { bytes: Uint8Array; type: ImageType }>();
	const overrides = new Map<string, TranslationOverride>();
	return {
		recipes,
		images,
		overrides,
		async saveRecipe(r: Recipe) {
			recipes.set(r.id, r);
		},
		async saveImage(recipeId: string, imageId: string, bytes: Uint8Array, type: ImageType) {
			images.set(`${recipeId}/${imageId}`, { bytes, type });
		},
		async setOverride(recipeId: string, language: Language, override: TranslationOverride) {
			overrides.set(`${recipeId}/${language}`, override);
		}
	};
}

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'migrate-'));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

async function write(relative: string, content: string | Uint8Array) {
	const file = path.join(dir, relative);
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, content);
}

describe('planMigration', () => {
	it('finds recipes, photos in both places, and edited translations', async () => {
		await write(
			'recipes.json',
			JSON.stringify([recipe('r1', ['img-a', 'legacy']), recipe('r2', [])])
		);
		await write('images/r1/img-a.png', PNG);
		await write('images/r1.jpg', JPEG); // the legacy photo, still in the old place
		await write('translations.json', JSON.stringify({ r1: { es: { hash: 'h1', fields } } }));

		const plan = await planMigration(dir);

		expect(plan.recipes.map((r) => r.id)).toEqual(['r1', 'r2']);
		expect(plan.images.map((i) => `${i.recipeId}/${i.imageId}:${i.type}`)).toEqual([
			'r1/img-a:image/png',
			'r1/legacy:image/jpeg'
		]);
		expect(plan.overrides).toEqual([
			{ recipeId: 'r1', language: 'es', override: { hash: 'h1', fields } }
		]);
		expect(plan.problems).toEqual([]);
	});

	it('reports what it leaves out, and carries on with the rest', async () => {
		await write(
			'recipes.json',
			JSON.stringify([recipe('r1', ['gone']), { id: 'bad' }, recipe('../escape', [])])
		);
		await write(
			'translations.json',
			JSON.stringify({
				r1: { es: { hash: 'h1', fields } },
				ghost: { es: { hash: 'h2', fields } }
			})
		);

		const plan = await planMigration(dir);

		expect(plan.recipes.map((r) => r.id)).toEqual(['r1']);
		expect(plan.images).toEqual([]);
		expect(plan.overrides).toHaveLength(1);
		expect(plan.problems).toEqual([
			'skipped a recipe that is not valid',
			'skipped a recipe that is not valid (id ../escape)',
			'missing or unreadable photo r1/gone',
			'skipped edited translations of unknown recipe ghost'
		]);
	});

	it('skips a file that is not a PNG or JPEG', async () => {
		await write('recipes.json', JSON.stringify([recipe('r1', ['img-a'])]));
		await write('images/r1/img-a.png', 'not really a picture');
		const plan = await planMigration(dir);
		expect(plan.images).toEqual([]);
		expect(plan.problems).toEqual(['missing or unreadable photo r1/img-a']);
	});

	it('treats an empty folder as nothing to copy', async () => {
		const plan = await planMigration(dir);
		expect(plan).toEqual({ recipes: [], images: [], overrides: [], problems: [] });
	});

	it('refuses a recipes file that is not valid JSON, rather than copying nothing', async () => {
		await write('recipes.json', '{ not json');
		await expect(planMigration(dir)).rejects.toThrow('not valid JSON');
	});

	it('never writes to the data folder', async () => {
		await write('recipes.json', JSON.stringify([recipe('r1', ['img-a'])]));
		await write('images/r1/img-a.png', PNG);
		const before = (await readdir(dir, { recursive: true })).sort();
		await planMigration(dir);
		expect((await readdir(dir, { recursive: true })).sort()).toEqual(before);
	});
});

describe('applyMigration', () => {
	it('copies everything into the target', async () => {
		await write('recipes.json', JSON.stringify([recipe('r1', ['img-a'])]));
		await write('images/r1/img-a.png', PNG);
		await write('translations.json', JSON.stringify({ r1: { es: { hash: 'h1', fields } } }));
		const target = memoryTarget();

		await applyMigration(await planMigration(dir), target);

		expect([...target.recipes.keys()]).toEqual(['r1']);
		expect(target.images.get('r1/img-a')).toEqual({ bytes: PNG, type: 'image/png' });
		expect(target.overrides.get('r1/es')).toEqual({ hash: 'h1', fields });
	});

	it('is safe to run twice: the second run leaves the same items', async () => {
		await write('recipes.json', JSON.stringify([recipe('r1', ['img-a'])]));
		await write('images/r1/img-a.png', PNG);
		await write('translations.json', JSON.stringify({ r1: { es: { hash: 'h1', fields } } }));
		const target = memoryTarget();
		const plan = await planMigration(dir);

		await applyMigration(plan, target);
		const once = [...target.recipes.keys(), ...target.images.keys(), ...target.overrides.keys()];
		await applyMigration(plan, target);
		const twice = [...target.recipes.keys(), ...target.images.keys(), ...target.overrides.keys()];

		expect(twice).toEqual(once);
	});
});
