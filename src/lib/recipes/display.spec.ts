import { describe, expect, it } from 'vitest';
import { editedFits, shownFields } from './display';
import type { Recipe } from './recipe';

const recipe = {
	id: 'r1',
	title: 'Soup',
	sourceUrl: null,
	sourceStart: null,
	ingredients: ['# Base', 'Water', 'Salt'],
	steps: ['Boil', 'Serve'],
	notes: '',
	images: [],
	source: 'typed',
	tags: [],
	createdAt: '2024-01-01T00:00:00.000Z',
	archived: false
} as Recipe;

const fitting = {
	title: 'Sopa',
	ingredients: ['agua', 'sal', 'sal'],
	steps: ['Hervir', 'Servir'],
	notes: ''
};

describe('an edited translation that fits the recipe', () => {
	it('is shown in place of the machine translation', () => {
		const shown = shownFields(recipe, null, { hash: 'h', fields: fitting });
		expect(shown.steps).toEqual(['Hervir', 'Servir']);
	});

	it('keeps the heading marker of the original', () => {
		const shown = shownFields(recipe, null, {
			hash: 'h',
			fields: { ...fitting, ingredients: ['Base', 'agua', 'sal'] }
		});
		expect(shown.ingredients[0]).toBe('# Base');
	});
});

describe('an edited translation that does not fit the recipe', () => {
	const misfit = { hash: 'h', fields: { ...fitting, steps: ['Hervir'] } };

	it('is not shown, and the machine translation or original is used', () => {
		expect(editedFits(recipe, misfit)).toBe(false);
		expect(shownFields(recipe, null, misfit)).toEqual({
			title: 'Soup',
			ingredients: recipe.ingredients,
			steps: recipe.steps,
			notes: ''
		});
	});
});
