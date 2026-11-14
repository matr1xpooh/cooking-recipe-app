import { describe, expect, it } from 'vitest';
import { removeLine } from './remove-line';
import type { RecipeStore } from './store';
import type { Recipe } from '#lib/recipes/recipe.js';
import type { TranslationOverride } from './translation-overrides';
import { sourceHash } from '#lib/recipes/translation-fields.js';
import type { Language } from '#lib/recipes/languages.js';

function recipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: 'r1',
		title: 'Tortilla',
		sourceUrl: null,
		sourceStart: null,
		ingredients: ['3 eggs', '> Large', '1 onion', '2 potatoes'],
		steps: ['Beat the eggs', 'Fry the onion', 'Add potatoes'],
		notes: '',
		images: [],
		source: 'typed',
		tags: [],
		createdAt: '2024-01-01T00:00:00.000Z',
		archived: false,
		...overrides
	} as Recipe;
}

/** An in-memory store with just the methods removeLine uses. */
function fakeStore(start: Recipe, overrides: Partial<Record<Language, TranslationOverride>> = {}) {
	let saved = start;
	const edits: Partial<Record<Language, TranslationOverride>> = { ...overrides };
	const store = {
		listRecipes: async () => [saved],
		saveRecipe: async (r: Recipe) => {
			saved = r;
		},
		getOverride: async (_id: string, lang: Language) => edits[lang],
		setOverride: async (_id: string, lang: Language, o: TranslationOverride) => {
			edits[lang] = o;
		}
	} as unknown as RecipeStore;
	return { store, saved: () => saved, edits };
}

describe('deleting a line everywhere', () => {
	it('removes an ingredient with its notes from the original', async () => {
		const { store, saved } = fakeStore(recipe());
		expect(await removeLine(store, 'r1', 'ingredients', 0)).toBe(true);
		expect(saved().ingredients).toEqual(['1 onion', '2 potatoes']);
	});

	it('removes the same line from an aligned translation and keeps it up to date', async () => {
		const start = recipe();
		const stamp = sourceHash(start);
		const translation = {
			title: 'Tortilla',
			ingredients: ['3 huevos', '> Grandes', '1 cebolla', '2 patatas'],
			steps: ['Batir', 'Freír', 'Añadir'],
			notes: ''
		};
		const { store, edits } = fakeStore(start, { es: { hash: stamp, fields: translation } });
		await removeLine(store, 'r1', 'steps', 1);
		expect(edits.es?.fields.steps).toEqual(['Batir', 'Añadir']);
		expect(edits.es?.hash).toBe(sourceHash(recipe({ steps: ['Beat the eggs', 'Add potatoes'] })));
	});

	it('leaves a translation alone when it did not match the original', async () => {
		const misaligned = {
			title: 'Tortilla',
			ingredients: ['huevos'],
			steps: ['Batir', 'Freír', 'Añadir', 'Servir'],
			notes: ''
		};
		const { store, edits } = fakeStore(recipe(), {
			ca: { hash: 'old', fields: misaligned }
		});
		await removeLine(store, 'r1', 'steps', 0);
		expect(edits.ca).toEqual({ hash: 'old', fields: misaligned });
	});

	it('keeps a stale translation stale', async () => {
		const translation = {
			title: 'Tortilla',
			ingredients: ['a', 'b', 'c', 'd'],
			steps: ['x', 'y', 'z'],
			notes: ''
		};
		const { store, edits } = fakeStore(recipe(), { ru: { hash: 'older', fields: translation } });
		await removeLine(store, 'r1', 'steps', 2);
		expect(edits.ru?.hash).toBe('older');
		expect(edits.ru?.fields.steps).toEqual(['x', 'y']);
	});

	it('returns false for an unknown line', async () => {
		const { store } = fakeStore(recipe());
		expect(await removeLine(store, 'r1', 'steps', 9)).toBe(false);
		expect(await removeLine(store, 'nope', 'steps', 0)).toBe(false);
	});
});
