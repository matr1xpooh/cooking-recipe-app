import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deleteRecipe, listRecipes, readImage, saveImage, saveRecipe } from './recipe-data';
import type { Recipe } from '#lib/recipes/recipe.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

const recipe: Recipe = {
	id: 'abc-1',
	title: 'Soup',
	sourceUrl: null,
	ingredients: ['water'],
	steps: ['Boil'],
	notes: '',
	hasImage: false,
	source: 'typed',

	category: 'other',
	createdAt: '2026-11-07T10:00:00.000Z',
	archived: false
};

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'recipes-'));
	process.env.RECIPE_DATA_DIR = dir;
});
afterEach(async () => {
	delete process.env.RECIPE_DATA_DIR;
	await rm(dir, { recursive: true, force: true });
});

describe('recipe files on disk', () => {
	it('survives a fresh read, as after a restart', async () => {
		await saveRecipe(recipe);
		await saveRecipe({ ...recipe, id: 'abc-2', title: 'Stew' });
		expect((await listRecipes()).map((r) => r.id)).toEqual(['abc-2', 'abc-1']);
		const onDisk = JSON.parse(await readFile(path.join(dir, 'recipes.json'), 'utf8'));
		expect(onDisk).toHaveLength(2);
	});

	it('replaces a recipe with the same id in place', async () => {
		await saveRecipe(recipe);
		await saveRecipe({ ...recipe, title: 'Better soup' });
		const all = await listRecipes();
		expect(all).toHaveLength(1);
		expect(all[0].title).toBe('Better soup');
	});

	it('moves an unreadable file aside instead of overwriting it', async () => {
		await mkdir(dir, { recursive: true });
		await writeFile(path.join(dir, 'recipes.json'), '{not json');
		expect(await listRecipes()).toEqual([]);
		const files = await readdir(dir);
		expect(files.some((f) => f.startsWith('recipes.corrupt-'))).toBe(true);
	});

	it('keeps a screenshot as the original bytes and replaces it on the next save', async () => {
		await saveImage('abc-1', PNG, 'image/png');
		const back = await readImage('abc-1');
		expect(back?.type).toBe('image/png');
		expect(Array.from(back!.bytes)).toEqual(Array.from(PNG));
		await saveImage('abc-1', new Uint8Array([0xff, 0xd8, 0xff, 9]), 'image/jpeg');
		expect((await readImage('abc-1'))?.type).toBe('image/jpeg');
		expect((await readdir(path.join(dir, 'images'))).length).toBe(1);
	});

	it('returns null for a recipe with no screenshot', async () => {
		expect(await readImage('nothing')).toBeNull();
	});

	it('deletes a recipe and its screenshot', async () => {
		await saveRecipe(recipe);
		await saveImage('abc-1', PNG, 'image/png');
		expect(await deleteRecipe('abc-1')).toBe(true);
		expect(await listRecipes()).toEqual([]);
		expect(await readImage('abc-1')).toBeNull();
	});

	it('reports when there is nothing to delete', async () => {
		expect(await deleteRecipe('missing')).toBe(false);
	});
});
