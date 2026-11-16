import { describe, expect, it } from 'vitest';
import { fromTexts, replaceLine, toItems, type RecipeFields } from './translation-fields';

const fields: RecipeFields = {
	title: 'Cake',
	ingredients: ['2 eggs'],
	steps: ['Mix', '# Dough', 'Knead'],
	notes: ''
};

describe('headings in steps', () => {
	it('sends a step heading without its marker and puts the marker back', () => {
		const items = toItems(fields);
		const dough = items.find((item) => item.text === 'Dough');
		expect(dough).toEqual({ text: 'Dough', styled: false });
		const translated = items.map((item) => (item.text === 'Dough' ? 'Тесто' : item.text));
		expect(fromTexts(fields, translated).steps).toEqual(['Mix', '# Тесто', 'Knead']);
	});

	it('keeps the marker when a step heading is edited', () => {
		const edited = replaceLine(fields, 'steps', 1, 'Filling');
		expect(edited.steps).toEqual(['Mix', '# Filling', 'Knead']);
	});
});
