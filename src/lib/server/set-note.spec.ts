import { describe, expect, it } from 'vitest';
import { setLineNote } from './set-note';
import type { RecipeStore } from './store';
import type { Recipe } from '#lib/recipes/recipe.js';
import type { TranslationOverride } from './translation-override';
import { sourceHash } from '#lib/recipes/translation-fields.js';
import type { Language } from '#lib/recipes/languages.js';

function recipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: 'r1',
		title: 'Cake',
		sourceUrl: null,
		sourceStart: null,
		ingredients: ['2 eggs'],
		steps: ['Mix', 'Bake', 'Cool'],
		notes: '',
		images: [],
		source: 'typed',
		tags: [],
		createdAt: '2024-01-01T00:00:00.000Z',
		archived: false,
		...overrides
	} as Recipe;
}

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

describe('making a line a note or a step again', () => {
	it('turns a step into a note of the step above', async () => {
		const { store, saved } = fakeStore(recipe());
		expect(await setLineNote(store, 'r1', 'steps', 1, true)).toBe('changed');
		expect(saved().steps).toEqual(['Mix', '> Bake', 'Cool']);
	});

	it('turns a note back into a step', async () => {
		const { store, saved } = fakeStore(recipe({ steps: ['Mix', '> Bake', 'Cool'] }));
		expect(await setLineNote(store, 'r1', 'steps', 1, false)).toBe('changed');
		expect(saved().steps).toEqual(['Mix', 'Bake', 'Cool']);
	});

	it('changes the same line in an aligned translation and keeps it up to date', async () => {
		const start = recipe();
		const stamp = sourceHash(start);
		const translation = {
			title: 'Pastel',
			ingredients: ['2 huevos'],
			steps: ['Mezclar', 'Hornear', 'Enfriar'],
			notes: ''
		};
		const { store, edits } = fakeStore(start, { es: { hash: stamp, fields: translation } });
		await setLineNote(store, 'r1', 'steps', 2, true);
		expect(edits.es?.fields.steps).toEqual(['Mezclar', 'Hornear', '> Enfriar']);
		// The words are the same, only the marker changed, so the translation is still up to date.
		expect(edits.es?.hash).toBe(stamp);
	});

	it('leaves a translation alone when it does not have the same lines', async () => {
		const start = recipe();
		const translation = { title: 'Pastel', ingredients: [], steps: ['Mezclar'], notes: '' };
		const { store, edits } = fakeStore(start, { es: { hash: 'old', fields: translation } });
		await setLineNote(store, 'r1', 'steps', 1, true);
		expect(edits.es).toEqual({ hash: 'old', fields: translation });
	});

	it('refuses a heading, a note with nothing above it, and a bad index', async () => {
		const { store } = fakeStore(recipe({ steps: ['# Dough', 'Mix'] }));
		expect(await setLineNote(store, 'r1', 'steps', 0, true)).toBe('heading');
		expect(await setLineNote(store, 'r1', 'steps', 1, true)).toBe('changed');
		expect(await setLineNote(store, 'r1', 'steps', 9, true)).toBe('bad_index');
		const first = fakeStore(recipe());
		expect(await setLineNote(first.store, 'r1', 'steps', 0, true)).toBe('bad_index');
	});
});
