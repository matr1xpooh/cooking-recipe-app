import { describe, it, expect } from 'vitest';
import { createRecipe, hasErrors, isHttpUrl, parseLines, validateRecipeInput } from './recipe';

const valid = { title: 'Pancakes', sourceUrl: '', ingredients: '', steps: '' };

describe('parseLines', () => {
	it('trims lines and drops empty ones', () => {
		expect(parseLines('  flour \n\n  milk\n   \neggs  ')).toEqual(['flour', 'milk', 'eggs']);
	});

	it('returns an empty list for blank text', () => {
		expect(parseLines('  \n ')).toEqual([]);
	});
});

describe('isHttpUrl', () => {
	it('accepts http and https URLs', () => {
		expect(isHttpUrl('https://example.com/recipe')).toBe(true);
		expect(isHttpUrl('http://example.com')).toBe(true);
	});

	it('rejects other schemes and non-URLs', () => {
		expect(isHttpUrl('javascript:alert(1)')).toBe(false);
		expect(isHttpUrl('example.com')).toBe(false);
		expect(isHttpUrl('')).toBe(false);
	});
});

describe('validateRecipeInput', () => {
	it('accepts a title alone', () => {
		expect(hasErrors(validateRecipeInput(valid))).toBe(false);
	});

	it('requires a non-blank title', () => {
		expect(validateRecipeInput({ ...valid, title: '   ' })).toEqual({ title: 'title_required' });
	});

	it('rejects an invalid source URL but allows an empty one', () => {
		expect(validateRecipeInput({ ...valid, sourceUrl: 'not a url' })).toEqual({
			sourceUrl: 'source_url_invalid'
		});
		expect(validateRecipeInput({ ...valid, sourceUrl: '  ' })).toEqual({});
	});
});

describe('createRecipe', () => {
	it('builds a recipe with trimmed fields and parsed lists', () => {
		const recipe = createRecipe(
			{
				title: '  Pancakes ',
				sourceUrl: ' https://example.com/p ',
				ingredients: 'flour\n milk ',
				steps: 'Mix\n\nCook'
			},
			{ id: 'abc', createdAt: new Date('2026-11-07T10:00:00Z') }
		);
		expect(recipe).toEqual({
			id: 'abc',
			title: 'Pancakes',
			sourceUrl: 'https://example.com/p',
			ingredients: ['flour', 'milk'],
			steps: ['Mix', 'Cook'],
			createdAt: '2026-11-07T10:00:00.000Z',
			archived: false
		});
	});

	it('stores a null source URL when none is given', () => {
		const recipe = createRecipe(valid, { id: 'abc', createdAt: new Date() });
		expect(recipe.sourceUrl).toBeNull();
	});
});
