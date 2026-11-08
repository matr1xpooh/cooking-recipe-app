import { describe, it, expect } from 'vitest';
import { RecipeStore, type RecipeApi } from './store.svelte';
import type { Recipe } from './recipe';

const recipe: Recipe = {
	id: '1',
	title: 'Soup',
	sourceUrl: null,
	ingredients: ['water'],
	steps: ['Boil'],
	notes: '',
	hasImage: false,
	source: 'typed',
	createdAt: '2026-11-07T10:00:00.000Z',
	archived: false
};

/** Fake server: keeps its own copy, and can be told to refuse saves. */
function fakeApi(
	initial: Recipe[] = [],
	options: { failSave?: boolean; failMigrate?: boolean } = {}
) {
	const server = [...initial];
	const api: RecipeApi = {
		list: async () => [...server],
		save: async (r) => {
			if (options.failSave) throw new Error('down');
			const i = server.findIndex((x) => x.id === r.id);
			if (i >= 0) server[i] = r;
			else server.unshift(r);
		},
		migrate: async () => {
			if (options.failMigrate) throw new Error('down');
		}
	};
	return { api, server };
}

describe('RecipeStore.load', () => {
	it('loads the recipes from the server', async () => {
		const { api } = fakeApi([recipe]);
		const store = new RecipeStore(api);
		await store.load();
		expect(store.recipes).toEqual([recipe]);
		expect(store.loadError).toBeNull();
	});

	it('reports a load failure instead of throwing', async () => {
		const { api } = fakeApi([], { failMigrate: true });
		const store = new RecipeStore(api);
		await store.load();
		expect(store.loadError).toBe('load_failed');
	});
});

describe('RecipeStore.add and update', () => {
	it('adds to the top and saves to the server', async () => {
		const { api, server } = fakeApi();
		const store = new RecipeStore(api);
		await store.add(recipe);
		await store.add({ ...recipe, id: '2', title: 'Stew' });
		expect(store.recipes.map((r) => r.id)).toEqual(['2', '1']);
		expect(server.map((r) => r.id)).toEqual(['2', '1']);
	});

	it('reverts the list and throws when the server refuses the add', async () => {
		const { api } = fakeApi([], { failSave: true });
		const store = new RecipeStore(api);
		await expect(store.add(recipe)).rejects.toThrow('down');
		expect(store.recipes).toEqual([]);
	});

	it('replaces the matching recipe and saves it', async () => {
		const { api, server } = fakeApi([recipe]);
		const store = new RecipeStore(api);
		await store.load();
		await store.update({ ...recipe, title: 'Better soup' });
		expect(store.recipes.map((r) => r.title)).toEqual(['Better soup']);
		expect(server[0].title).toBe('Better soup');
	});

	it('reverts an update the server refuses', async () => {
		const { api } = fakeApi([recipe], { failSave: true });
		const store = new RecipeStore(api);
		await store.load();
		await expect(store.update({ ...recipe, title: 'Nope' })).rejects.toThrow('down');
		expect(store.recipes[0].title).toBe('Soup');
	});

	it('ignores an update for an unknown id', async () => {
		const { api } = fakeApi([recipe]);
		const store = new RecipeStore(api);
		await store.load();
		await store.update({ ...recipe, id: 'missing', title: 'x' });
		expect(store.recipes.map((r) => r.id)).toEqual(['1']);
	});
});
