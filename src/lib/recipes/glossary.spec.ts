import { describe, expect, it } from 'vitest';
import { applyGlossary, fixFromEdit, measureOf, type GlossaryRule } from './glossary';

const flour: GlossaryRule = { id: '1', language: 'en', source: 'мука', target: 'Flour' };
const oil: GlossaryRule = {
	id: '2',
	language: 'en',
	source: 'масло',
	target: 'oil',
	unit: 'volume'
};

describe('measureOf', () => {
	it('reads spoons and cups as volume, and grams as weight', () => {
		expect(measureOf('Масло - 1 ч.л')).toBe('volume');
		expect(measureOf('Масло 2 ст. л.')).toBe('volume');
		expect(measureOf('Молоко 200 мл')).toBe('volume');
		expect(measureOf('Сливочное масло 50 г')).toBe('weight');
		expect(measureOf('Яйца 4 шт.')).toBeNull();
	});
});

describe('applyGlossary', () => {
	it('replaces the word in every line of the language', () => {
		expect(applyGlossary(['Мука 60 г', 'Мука пшеничная'], [flour], 'en')).toEqual([
			'Flour 60 г',
			'Flour пшеничная'
		]);
	});

	it('does not replace a longer word that contains the fix', () => {
		expect(applyGlossary(['Мукой посыпать'], [flour], 'en')).toEqual(['Мукой посыпать']);
	});

	it('matches regardless of case', () => {
		expect(applyGlossary(['МУКА 1 кг'], [flour], 'en')).toEqual(['Flour 1 кг']);
	});

	it('applies a unit-limited fix only to lines measured that way', () => {
		expect(applyGlossary(['Масло - 1 ч.л', 'Сливочное масло 50 г'], [oil], 'en')).toEqual([
			'oil - 1 ч.л',
			'Сливочное масло 50 г'
		]);
	});

	it('leaves the lines alone for another language', () => {
		expect(applyGlossary(['Мука 60 г'], [flour], 'es')).toEqual(['Мука 60 г']);
	});

	it('returns the lines unchanged when there are no fixes', () => {
		const lines = ['Мука 60 г'];
		expect(applyGlossary(lines, [], 'en')).toBe(lines);
	});
});

describe('fixFromEdit', () => {
	it('gives a fix when the first word of the line was changed', () => {
		expect(fixFromEdit('Мука 60 г', 'Face 60 g', 'Flour 60 g')).toEqual({
			source: 'мука',
			target: 'Flour'
		});
	});

	it('gives no fix when only the amount or the rest of the line changed', () => {
		expect(fixFromEdit('Мука 60 г', 'Face 60 g', 'Face 60 grams')).toBeNull();
	});

	it('gives a unit-limited fix for масло, by its measure', () => {
		expect(fixFromEdit('Масло - 1 ч.л', 'Butter - 1 tsp', 'Oil - 1 tsp')).toEqual({
			source: 'масло',
			target: 'Oil',
			unit: 'volume'
		});
	});

	it('gives no fix for масло with no measure', () => {
		expect(fixFromEdit('Масло', 'Butter', 'Oil')).toBeNull();
	});

	it('gives no fix when the original is not Russian', () => {
		expect(fixFromEdit('Flour 60 g', 'Flour 60 g', 'Wheat flour 60 g')).toBeNull();
	});
});
