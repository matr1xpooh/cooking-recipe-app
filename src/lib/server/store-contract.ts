import { describe, it, expect } from 'vitest';
import type { Recipe } from '#lib/recipes/recipe.js';
import type { RecipeStore } from './store';

/**
 * The behaviour every RecipeStore must have. Each backend's spec runs these same cases
 * against its own store, so the file store and the AWS store can't drift apart.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]);

const base: Recipe = {
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

export interface ContractStore {
	store: RecipeStore;
	cleanup(): Promise<void>;
}

export function describeStoreContract(name: string, create: () => Promise<ContractStore>): void {
	describe(`${name}: recipes`, () => {
		it('lists the newest recipe first and keeps it after a save', async () => {
			const { store, cleanup } = await create();
			try {
				await store.saveRecipe(base);
				await store.saveRecipe({
					...base,
					id: 'abc-2',
					title: 'Stew',
					createdAt: '2026-11-08T10:00:00.000Z'
				});
				expect((await store.listRecipes()).map((r) => r.id)).toEqual(['abc-2', 'abc-1']);
			} finally {
				await cleanup();
			}
		});

		it('replaces a recipe with the same id, keeping its place', async () => {
			const { store, cleanup } = await create();
			try {
				await store.saveRecipe(base);
				await store.saveRecipe({ ...base, title: 'Better soup' });
				const all = await store.listRecipes();
				expect(all).toHaveLength(1);
				expect(all[0].title).toBe('Better soup');
			} finally {
				await cleanup();
			}
		});

		it('deletes a recipe and reports when there is nothing to delete', async () => {
			const { store, cleanup } = await create();
			try {
				await store.saveRecipe(base);
				expect(await store.deleteRecipe(base.id)).toBe(true);
				expect(await store.listRecipes()).toEqual([]);
				expect(await store.deleteRecipe(base.id)).toBe(false);
			} finally {
				await cleanup();
			}
		});
	});

	describe(`${name}: images`, () => {
		it('keeps each image as its original bytes, several per recipe', async () => {
			const { store, cleanup } = await create();
			try {
				await store.saveRecipe(base);
				const a = store.newImageId();
				const b = store.newImageId();
				await store.saveImage(base.id, a, PNG, 'image/png');
				await store.saveImage(base.id, b, JPEG, 'image/jpeg');
				expect(await store.readImage(base.id, a)).toEqual({ bytes: PNG, type: 'image/png' });
				expect(await store.readImage(base.id, b)).toEqual({ bytes: JPEG, type: 'image/jpeg' });
			} finally {
				await cleanup();
			}
		});

		it('removes one image and leaves the others', async () => {
			const { store, cleanup } = await create();
			try {
				await store.saveRecipe(base);
				const a = store.newImageId();
				const b = store.newImageId();
				await store.saveImage(base.id, a, PNG, 'image/png');
				await store.saveImage(base.id, b, JPEG, 'image/jpeg');
				await store.deleteImage(base.id, a);
				expect(await store.readImage(base.id, a)).toBeNull();
				expect(await store.readImage(base.id, b)).not.toBeNull();
			} finally {
				await cleanup();
			}
		});

		it('returns null for an image that is not there', async () => {
			const { store, cleanup } = await create();
			try {
				expect(await store.readImage('abc-1', 'missing')).toBeNull();
			} finally {
				await cleanup();
			}
		});

		it('deletes a recipe together with its images', async () => {
			const { store, cleanup } = await create();
			try {
				await store.saveRecipe(base);
				const a = store.newImageId();
				await store.saveImage(base.id, a, PNG, 'image/png');
				await store.deleteRecipe(base.id);
				expect(await store.readImage(base.id, a)).toBeNull();
			} finally {
				await cleanup();
			}
		});
	});

	describe(`${name}: addresses and duplicates`, () => {
		const video = {
			...base,
			sourceUrl: 'https://youtu.be/abc123',
			sourceStart: 90,
			title: 'Dumplings'
		};

		it('finds a saved recipe whose address is written differently', async () => {
			const { store, cleanup } = await create();
			try {
				await store.saveRecipe(video);
				const found = await store.findRecipeByUrl(
					'https://www.youtube.com/watch?v=abc123&utm_source=x'
				);
				expect(found?.id).toBe(video.id);
			} finally {
				await cleanup();
			}
		});

		it('ignores the recipe itself when checking an edit', async () => {
			const { store, cleanup } = await create();
			try {
				await store.saveRecipe(video);
				expect(await store.findRecipeByUrl(video.sourceUrl!, video.id)).toBeUndefined();
			} finally {
				await cleanup();
			}
		});

		it('allows several dishes from one video, but not the same dish twice', async () => {
			const { store, cleanup } = await create();
			try {
				await store.saveRecipe(video);
				const other = { ...video, id: 'abc-9', title: 'Noodles' };
				expect(await store.findSameRecipe(other)).toBeUndefined();
				const twice = { ...video, id: 'abc-8' };
				expect((await store.findSameRecipe(twice))?.id).toBe(video.id);
			} finally {
				await cleanup();
			}
		});
	});

	describe(`${name}: edited translations`, () => {
		const fields = { title: 'Sopa', ingredients: ['agua'], steps: ['Hervir'], notes: '' };

		it('keeps an edit per recipe and language, and deletes it on reset', async () => {
			const { store, cleanup } = await create();
			try {
				await store.setOverride('r1', 'es', { hash: 'h1', fields });
				expect(await store.getOverride('r1', 'es')).toEqual({ hash: 'h1', fields });
				expect(await store.getOverride('r1', 'ca')).toBeUndefined();
				await store.deleteOverride('r1', 'es');
				expect(await store.getOverride('r1', 'es')).toBeUndefined();
			} finally {
				await cleanup();
			}
		});

		it('removes all edits of a deleted recipe and leaves others', async () => {
			const { store, cleanup } = await create();
			try {
				await store.setOverride('r1', 'es', { hash: 'h1', fields });
				await store.setOverride('r1', 'ca', { hash: 'h1', fields });
				await store.setOverride('r2', 'es', { hash: 'h2', fields });
				await store.removeOverridesFor('r1');
				expect(await store.getOverride('r1', 'es')).toBeUndefined();
				expect(await store.getOverride('r1', 'ca')).toBeUndefined();
				expect(await store.getOverride('r2', 'es')).toEqual({ hash: 'h2', fields });
			} finally {
				await cleanup();
			}
		});
	});
}
