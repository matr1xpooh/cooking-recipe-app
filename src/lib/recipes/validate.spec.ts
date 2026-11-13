import { describe, it, expect } from 'vitest';
import { decodeRecipeText, isRecipe, normalizeRecipe } from './validate';

const recipe = {
	id: '1',
	title: 'Soup',
	sourceUrl: null,
	sourceStart: null,
	ingredients: ['water'],
	steps: ['Boil'],
	createdAt: '2026-11-07T10:00:00.000Z',
	archived: false
};

describe('isRecipe', () => {
	it('accepts a recipe, with or without the newer optional fields', () => {
		expect(isRecipe(recipe)).toBe(true);
		expect(isRecipe({ ...recipe, notes: 'x', images: ['legacy'], source: 'web' })).toBe(true);
	});

	it('rejects malformed values', () => {
		expect(isRecipe({ ...recipe, id: 5 })).toBe(false);
		expect(isRecipe({ ...recipe, source: 'elsewhere' })).toBe(false);
		expect(isRecipe(null)).toBe(false);
	});
});

describe('normalizeRecipe', () => {
	it('fills defaults for recipes saved before notes, screenshots and sources', () => {
		expect(normalizeRecipe(recipe as never)).toEqual({
			...recipe,
			notes: '',
			images: [],
			source: 'typed',
			tags: []
		});
	});

	it('infers an image source for a recipe with a screenshot and no source', () => {
		expect(normalizeRecipe({ ...recipe, images: ['legacy'] } as never).source).toBe('image');
	});
});

describe('tags from the old single category', () => {
	it('keeps a category as the only tag, and drops "other"', () => {
		expect(normalizeRecipe({ ...recipe, category: 'meat' } as never).tags).toEqual(['meat']);
		expect(normalizeRecipe({ ...recipe, category: 'other' } as never).tags).toEqual([]);
	});

	it('keeps tags when they are present', () => {
		expect(normalizeRecipe({ ...recipe, tags: ['fish', 'soup'] } as never).tags).toEqual([
			'fish',
			'soup'
		]);
	});
});

describe('decodeRecipeText', () => {
	it('stores apostrophes and ampersands as characters in every text field', () => {
		const recipe = normalizeRecipe({
			id: 'abc',
			title: 'Cook&#39;s &amp; friends',
			sourceUrl: null,
			sourceStart: null,
			ingredients: ['Don&#39;t skip the salt'],
			steps: ['If you don&#x27;t have a burner&#8230;'],
			notes: 'Bob&apos;s tip',
			images: [],
			source: 'typed',
			tags: [],
			createdAt: '2026-11-13T00:00:00.000Z',
			archived: false
		});
		const decoded = decodeRecipeText(recipe);
		expect(decoded.title).toBe("Cook's & friends");
		expect(decoded.ingredients).toEqual(["Don't skip the salt"]);
		expect(decoded.steps).toEqual(["If you don't have a burner\u2026"]);
		expect(decoded.notes).toBe("Bob's tip");
	});

	it('leaves text without character references unchanged', () => {
		const recipe = normalizeRecipe({
			id: 'abc',
			title: 'Plain title',
			sourceUrl: null,
			sourceStart: null,
			ingredients: ['1 egg'],
			steps: ['Beat it'],
			notes: '',
			images: [],
			source: 'typed',
			tags: [],
			createdAt: '2026-11-13T00:00:00.000Z',
			archived: false
		});
		expect(decodeRecipeText(recipe)).toEqual(recipe);
	});
});
