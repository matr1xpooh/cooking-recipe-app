import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	deleteImage,
	deleteRecipe,
	findRecipeByUrl,
	findSameRecipe,
	listRecipes,
	readImage,
	saveImage,
	saveRecipe
} from './recipe-data';
import type { Recipe } from '#lib/recipes/recipe.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

const recipe: Recipe = {
	id: 'abc-1',
	title: 'Soup',
	sourceUrl: null,
	sourceStart: null,
	ingredients: ['water'],
	steps: ['Boil'],
	notes: '',
	images: [],
	source: 'typed',

	tags: [],
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

	it('keeps each image as its original bytes, several per recipe', async () => {
		await saveImage('abc-1', 'one', PNG, 'image/png');
		await saveImage('abc-1', 'two', new Uint8Array([0xff, 0xd8, 0xff, 9]), 'image/jpeg');
		const first = await readImage('abc-1', 'one');
		expect(first?.type).toBe('image/png');
		expect(Array.from(first!.bytes)).toEqual(Array.from(PNG));
		expect((await readImage('abc-1', 'two'))?.type).toBe('image/jpeg');
		expect((await readdir(path.join(dir, 'images', 'abc-1'))).length).toBe(2);
	});

	it('removes one image and leaves the others', async () => {
		await saveImage('abc-1', 'one', PNG, 'image/png');
		await saveImage('abc-1', 'two', PNG, 'image/png');
		await deleteImage('abc-1', 'one');
		expect(await readImage('abc-1', 'one')).toBeNull();
		expect(await readImage('abc-1', 'two')).not.toBeNull();
	});

	it('returns null for an image that is not there', async () => {
		expect(await readImage('nothing', 'none')).toBeNull();
	});

	it('moves the old single screenshot into the recipe folder as image "legacy"', async () => {
		await mkdir(path.join(dir, 'images'), { recursive: true });
		await writeFile(path.join(dir, 'images', 'abc-1.png'), PNG);
		await writeFile(
			path.join(dir, 'recipes.json'),
			JSON.stringify([{ ...recipe, hasImage: true, images: undefined }])
		);
		const [migrated] = await listRecipes();
		expect(migrated.images).toEqual(['legacy']);
		expect(Array.from((await readImage('abc-1', 'legacy'))!.bytes)).toEqual(Array.from(PNG));
	});

	it('deletes a recipe and its screenshot', async () => {
		await saveRecipe(recipe);
		await saveImage('abc-1', 'one', PNG, 'image/png');
		expect(await deleteRecipe('abc-1')).toBe(true);
		expect(await listRecipes()).toEqual([]);
		expect(await readImage('abc-1', 'one')).toBeNull();
	});

	it('reports when there is nothing to delete', async () => {
		expect(await deleteRecipe('missing')).toBe(false);
	});
});

describe('finding a recipe by its address', () => {
	it('finds a saved recipe whose address is written differently', async () => {
		await saveRecipe({ ...recipe, sourceUrl: 'https://www.youtube.com/watch?v=abc123' });
		expect((await findRecipeByUrl('https://youtu.be/abc123'))?.id).toBe('abc-1');
		expect(await findRecipeByUrl('https://youtu.be/other')).toBeUndefined();
	});

	it('ignores the recipe itself when checking an edit', async () => {
		await saveRecipe({ ...recipe, sourceUrl: 'https://example.com/a' });
		expect(await findRecipeByUrl('https://example.com/a', 'abc-1')).toBeUndefined();
	});
});

describe('same dish', () => {
	it('allows several dishes from one video, but not the same dish twice', async () => {
		const video = 'https://www.youtube.com/watch?v=vid123';
		await saveRecipe({ ...recipe, sourceUrl: video, title: 'Dish A' });
		expect(
			await findSameRecipe({ ...recipe, id: 'other', sourceUrl: video, title: 'Dish B' })
		).toBeUndefined();
		expect(
			(await findSameRecipe({ ...recipe, id: 'other', sourceUrl: video, title: 'dish a' }))?.id
		).toBe('abc-1');
		expect(
			await findSameRecipe({
				...recipe,
				id: 'other',
				sourceUrl: video,
				title: 'Dish A',
				sourceStart: 90
			})
		).toBeUndefined();
	});
});
