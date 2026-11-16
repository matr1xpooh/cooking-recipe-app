import { describe, expect, it } from 'vitest';
import { newIngredientLines, photoProblem } from './photos';
import { MAX_IMAGE_BYTES } from './screenshot';

describe('photoProblem', () => {
	it('accepts PNG and JPEG up to the size limit', () => {
		expect(photoProblem({ size: 1000, type: 'image/png' })).toBeNull();
		expect(photoProblem({ size: MAX_IMAGE_BYTES, type: 'image/jpeg' })).toBeNull();
	});

	it('refuses a file that is too large', () => {
		expect(photoProblem({ size: MAX_IMAGE_BYTES + 1, type: 'image/png' })).toBe('image_too_large');
	});

	it('refuses other types', () => {
		expect(photoProblem({ size: 10, type: 'image/gif' })).toBe('image_invalid');
		expect(photoProblem({ size: 10, type: '' })).toBe('image_invalid');
	});
});

describe('newIngredientLines', () => {
	it('keeps only the lines that are not already in the list', () => {
		expect(
			newIngredientLines(['2 eggs', '1 onion'], ['2 Eggs', '250 g flour', '250 g flour'])
		).toEqual(['250 g flour']);
	});

	it('returns everything when the list is empty', () => {
		expect(newIngredientLines([], ['Salt', 'Pepper'])).toEqual(['Salt', 'Pepper']);
	});
});
