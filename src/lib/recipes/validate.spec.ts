import { describe, it, expect } from 'vitest';
import { isRecipe, normalizeRecipe } from './validate';

const recipe = {
	id: '1',
	title: 'Soup',
	sourceUrl: null,
	ingredients: ['water'],
	steps: ['Boil'],
	createdAt: '2026-11-07T10:00:00.000Z',
	archived: false
};

describe('isRecipe', () => {
	it('accepts a recipe, with or without the newer optional fields', () => {
		expect(isRecipe(recipe)).toBe(true);
		expect(isRecipe({ ...recipe, notes: 'x', hasImage: true, source: 'web' })).toBe(true);
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
			hasImage: false,
			source: 'typed',
			tags: []
		});
	});

	it('infers an image source for a recipe with a screenshot and no source', () => {
		expect(normalizeRecipe({ ...recipe, hasImage: true } as never).source).toBe('image');
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
