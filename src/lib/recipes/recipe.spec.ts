import { describe, it, expect } from 'vitest';
import {
	MAX_TAGS_PER_RECIPE,
	normalizeTag,
	normalizeTags,
	applyEdit,
	mergeIngredientLines,
	createRecipe,
	hasErrors,
	isHttpUrl,
	parseLines,
	validateRecipeInput
} from './recipe';

const valid = {
	title: 'Pancakes',
	sourceUrl: '',
	ingredients: '',
	steps: '',
	tags: []
};

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
				steps: 'Mix\n\nCook',
				tags: ['dessert']
			},
			{
				id: 'abc',
				createdAt: new Date('2026-11-07T10:00:00Z')
			}
		);
		expect(recipe).toEqual({
			id: 'abc',
			title: 'Pancakes',
			sourceUrl: 'https://example.com/p',
			ingredients: ['flour', 'milk'],
			steps: ['Mix', 'Cook'],
			notes: '',
			hasImage: false,
			source: 'typed',
			tags: ['dessert'],
			createdAt: '2026-11-07T10:00:00.000Z',
			archived: false
		});
	});

	it('stores a null source URL when none is given', () => {
		const recipe = createRecipe(valid, {
			id: 'abc',
			createdAt: new Date()
		});
		expect(recipe.sourceUrl).toBeNull();
	});
});

describe('applyEdit', () => {
	const original = createRecipe(
		{
			title: 'Soup',
			sourceUrl: 'https://example.com/soup',
			ingredients: 'water',
			steps: 'Boil',
			tags: []
		},
		{ id: 'keep-me', createdAt: new Date('2026-01-01T00:00:00Z') }
	);

	it('replaces editable fields and keeps identity, date, notes and archive state', () => {
		const edited = applyEdit(
			{ ...original, notes: 'legacy', archived: true },
			{
				title: '  Stew ',
				sourceUrl: '',
				ingredients: 'beef\n\nonion',
				steps: '**Brown** it',
				tags: []
			},
			'web'
		);
		expect(edited).toEqual({
			id: 'keep-me',
			title: 'Stew',
			sourceUrl: null,
			ingredients: ['beef', 'onion'],
			steps: ['**Brown** it'],
			notes: 'legacy',
			hasImage: false,
			source: 'web',
			tags: [],
			createdAt: '2026-01-01T00:00:00.000Z',
			archived: true
		});
	});
});

describe('mergeIngredientLines', () => {
	it('adds only lines not already present, ignoring case and spaces', () => {
		expect(mergeIngredientLines(['Flour', 'egg'], [' flour ', 'Milk', 'EGG', ''])).toEqual([
			'Flour',
			'egg',
			'Milk'
		]);
	});

	it('keeps current lines even when they are blank-padded', () => {
		expect(mergeIngredientLines(['  salt  '], ['pepper'])).toEqual(['salt', 'pepper']);
	});
});

describe('typed tags', () => {
	it('cleans a typed tag: trimmed, lowercase, single spaces', () => {
		expect(normalizeTag('  Quick   Lunch ')).toBe('quick lunch');
	});

	it('rejects empty and overlong tags', () => {
		expect(normalizeTag('   ')).toBeNull();
		expect(normalizeTag('x'.repeat(31))).toBeNull();
	});

	it('removes duplicates and keeps at most ten tags', () => {
		expect(normalizeTags(['Lunch', 'lunch', ' lunch ', 'quick'])).toEqual(['lunch', 'quick']);
		const many = Array.from({ length: 15 }, (_, i) => `tag${i}`);
		expect(normalizeTags(many)).toHaveLength(MAX_TAGS_PER_RECIPE);
	});

	it('ignores non-text values', () => {
		expect(normalizeTags(['soup', 42, null, 'stew'])).toEqual(['soup', 'stew']);
	});
});
