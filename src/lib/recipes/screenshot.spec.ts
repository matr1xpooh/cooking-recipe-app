import { describe, it, expect } from 'vitest';
import { parseIngredientLines, sniffImageType } from './screenshot';

describe('sniffImageType', () => {
	it('recognises PNG and JPEG by signature', () => {
		expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe('image/png');
		expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
	});

	it('rejects anything else', () => {
		expect(sniffImageType(new TextEncoder().encode('<html>'))).toBeNull();
		expect(sniffImageType(new Uint8Array([]))).toBeNull();
	});
});

describe('parseIngredientLines', () => {
	it('keeps ingredient lines and drops the heading', () => {
		expect(
			parseIngredientLines(['Ingredients', '2 cups all-purpose flour', '1 egg', '1 1/2 cups milk'])
		).toEqual(['2 cups all-purpose flour', '1 egg', '1 1/2 cups milk']);
	});

	it('drops Russian headings, bullets, sub-headings and number-only lines', () => {
		expect(
			parseIngredientLines([
				'Ингредиенты:',
				'• Мука 200 г',
				'Соус:',
				'1/2',
				'  Сахар   1 ст. ложка  '
			])
		).toEqual(['Мука 200 г', 'Сахар 1 ст. ложка']);
	});

	it('returns nothing for text with no ingredient words', () => {
		expect(parseIngredientLines(['', '  ', '42', '•'])).toEqual([]);
	});
});
