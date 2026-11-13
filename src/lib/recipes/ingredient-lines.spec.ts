import { describe, expect, it } from 'vitest';
import { groupIngredients, headingText, isHeading } from './ingredient-lines';
import { fromTexts, toItems, type RecipeFields } from './translation-fields';

describe('heading lines', () => {
	it('recognises a line that starts with the marker', () => {
		expect(isHeading('# For the Stir-fry')).toBe(true);
		expect(isHeading('2 tbsp. Cooking oil')).toBe(false);
		expect(isHeading('#no space')).toBe(false);
	});

	it('returns the heading words without the marker', () => {
		expect(headingText('# Beef Marinade')).toBe('Beef Marinade');
		expect(headingText('Salt')).toBe('Salt');
	});
});

describe('groupIngredients', () => {
	it('puts each heading over the ingredients below it', () => {
		expect(
			groupIngredients([
				'# Beef Marinade',
				'1 tbsp. Soy sauce',
				'1 tbsp. Wine',
				'# For the Stir-fry',
				'2 tbsp. Oil'
			])
		).toEqual([
			{ heading: 'Beef Marinade', items: ['1 tbsp. Soy sauce', '1 tbsp. Wine'] },
			{ heading: 'For the Stir-fry', items: ['2 tbsp. Oil'] }
		]);
	});

	it('keeps ingredients before the first heading in a group with no heading', () => {
		expect(groupIngredients(['Salt', '# Sauce', 'Honey'])).toEqual([
			{ heading: null, items: ['Salt'] },
			{ heading: 'Sauce', items: ['Honey'] }
		]);
	});

	it('leaves a list with no headings as one group', () => {
		expect(groupIngredients(['Salt', 'Pepper'])).toEqual([
			{ heading: null, items: ['Salt', 'Pepper'] }
		]);
	});

	it('keeps a heading that has no ingredients under it', () => {
		expect(groupIngredients(['# Sauce', '# Garnish', 'Parsley'])).toEqual([
			{ heading: 'Sauce', items: [] },
			{ heading: 'Garnish', items: ['Parsley'] }
		]);
	});

	it('returns no groups for an empty list', () => {
		expect(groupIngredients([])).toEqual([]);
	});
});

describe('translation keeps headings', () => {
	const fields: RecipeFields = {
		title: 'Stir-fry',
		ingredients: ['# Beef Marinade', '1 tbsp. Soy sauce'],
		steps: ['Cook.'],
		notes: ''
	};

	it('sends the heading without its marker', () => {
		const texts = toItems(fields).map((item) => item.text);
		expect(texts).toEqual(['Stir-fry', 'Beef Marinade', '1 tbsp. Soy sauce', 'Cook.', '']);
	});

	it('puts the marker back on the translated heading', () => {
		const translated = fromTexts(fields, [
			'Жаркое',
			'Маринад для говядины',
			'1 ст. л. соевого соуса',
			'Готовьте.',
			''
		]);
		expect(translated.ingredients).toEqual(['# Маринад для говядины', '1 ст. л. соевого соуса']);
	});
});
