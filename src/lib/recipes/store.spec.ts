import { describe, it, expect } from 'vitest';
import {
	RECIPES_STORAGE_KEY,
	RecipeStore,
	readRecipes,
	type KeyValueStorage
} from './store.svelte';
import type { Recipe } from './recipe';

function memoryStorage(
	initial: Record<string, string> = {}
): KeyValueStorage & { data: Map<string, string> } {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => void data.set(key, value)
	};
}

const recipe: Recipe = {
	id: '1',
	title: 'Soup',
	sourceUrl: null,
	ingredients: ['water'],
	steps: ['Boil'],
	notes: '',
	createdAt: '2026-11-07T10:00:00.000Z',
	archived: false
};

describe('RecipeStore', () => {
	it('adds recipes to the top and persists them', () => {
		const storage = memoryStorage();
		const store = new RecipeStore(storage);
		store.add(recipe);
		store.add({ ...recipe, id: '2', title: 'Stew' });

		expect(store.recipes.map((r) => r.id)).toEqual(['2', '1']);
		expect(readRecipes(storage).map((r) => r.id)).toEqual(['2', '1']);
	});

	it('loads previously persisted recipes', () => {
		const storage = memoryStorage({ [RECIPES_STORAGE_KEY]: JSON.stringify([recipe]) });
		const store = new RecipeStore(storage);
		store.load();
		expect(store.recipes).toEqual([recipe]);
	});

	it('ignores corrupt or malformed stored data', () => {
		expect(readRecipes(memoryStorage({ [RECIPES_STORAGE_KEY]: '{not json' }))).toEqual([]);
		expect(readRecipes(memoryStorage({ [RECIPES_STORAGE_KEY]: '{"a":1}' }))).toEqual([]);
		expect(readRecipes(memoryStorage({ [RECIPES_STORAGE_KEY]: '[{"id":5}]' }))).toEqual([]);
	});

	it('works without storage (server-side)', () => {
		const store = new RecipeStore(null);
		store.load();
		store.add(recipe);
		expect(store.recipes).toEqual([recipe]);
	});
});

describe('RecipeStore.update', () => {
	it('replaces the matching recipe and persists', () => {
		const storage = memoryStorage();
		const store = new RecipeStore(storage);
		store.add(recipe);
		store.update({ ...recipe, title: 'Better soup' });
		expect(store.recipes.map((r) => r.title)).toEqual(['Better soup']);
		expect(readRecipes(storage)[0].title).toBe('Better soup');
	});

	it('ignores an unknown id', () => {
		const store = new RecipeStore(memoryStorage());
		store.add(recipe);
		store.update({ ...recipe, id: 'missing', title: 'x' });
		expect(store.recipes).toHaveLength(1);
		expect(store.recipes[0].title).toBe('Soup');
	});
});
