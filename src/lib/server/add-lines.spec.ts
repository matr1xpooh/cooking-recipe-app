import { describe, expect, it } from 'vitest';
import { addLines } from './add-lines';
import type { RecipeStore } from './store';
import type { Recipe } from '#lib/recipes/recipe.js';
import type { TranslationOverride } from './translation-overrides';
import { sourceHash, MAX_TRANSLATED_LINES } from '#lib/recipes/translation-fields.js';
import type { Language } from '#lib/recipes/languages.js';

function recipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: 'r1',
		title: 'Tortilla',
		sourceUrl: null,
		sourceStart: null,
		ingredients: ['3 eggs', '1 onion'],
		steps: ['Beat the eggs', 'Fry the onion'],
		notes: '',
		images: [],
		source: 'typed',
		tags: [],
		createdAt: '2024-01-01T00:00:00.000Z',
		archived: false,
		...overrides
	} as Recipe;
}

/** An in-memory store with just the methods addLines uses. */
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

describe('adding lines everywhere', () => {
	it('appends lines to the end of the original list', async () => {
		const { store, saved } = fakeStore(recipe());
		expect(await addLines(store, 'r1', 'ingredients', ['Salt 5 g', '# Sauce'])).toBe('added');
		expect(saved().ingredients).toEqual(['3 eggs', '1 onion', 'Salt 5 g', '# Sauce']);
		expect(saved().steps).toEqual(['Beat the eggs', 'Fry the onion']);
	});

	it('appends the same lines to an aligned translation and leaves it flagged as out of date', async () => {
		const start = recipe();
		const stamp = sourceHash(start);
		const translation = {
			title: 'Tortilla',
			ingredients: ['3 huevos', '1 cebolla'],
			steps: ['Batir', 'Freír'],
			notes: ''
		};
		const { store, edits } = fakeStore(start, { es: { hash: stamp, fields: translation } });
		await addLines(store, 'r1', 'steps', ['Servir']);
		expect(edits.es?.fields.steps).toEqual(['Batir', 'Freír', 'Servir']);
		expect(edits.es?.fields.ingredients).toEqual(['3 huevos', '1 cebolla']);
		// The new line has no translation yet, so the old stamp stays and the reader is told to check it.
		expect(edits.es?.hash).toBe(stamp);
	});

	it('leaves a translation alone when it did not have the same lines as the original', async () => {
		const start = recipe();
		const translation = {
			title: 'Tortilla',
			ingredients: ['3 huevos'],
			steps: ['Batir', 'Freír'],
			notes: ''
		};
		const { store, edits } = fakeStore(start, { es: { hash: 'old', fields: translation } });
		await addLines(store, 'r1', 'ingredients', ['Sal']);
		expect(edits.es).toEqual({ hash: 'old', fields: translation });
	});

	it('refuses a list that would pass the line limit', async () => {
		const full = Array.from({ length: MAX_TRANSLATED_LINES }, (_, i) => `line ${i}`);
		const { store, saved } = fakeStore(recipe({ steps: full }));
		expect(await addLines(store, 'r1', 'steps', ['one more'])).toBe('too_many');
		expect(saved().steps).toHaveLength(MAX_TRANSLATED_LINES);
	});

	it('returns not_found for an unknown recipe', async () => {
		const { store } = fakeStore(recipe());
		expect(await addLines(store, 'nope', 'steps', ['x'])).toBe('not_found');
	});
});
