import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TEXT_SIZE_INDEX,
	TEXT_SIZE_STEPS,
	nextTextSizeIndex,
	readTextSizeIndex,
	textSizePercent
} from './text-size';

describe('nextTextSizeIndex', () => {
	it('moves one step up and down', () => {
		expect(nextTextSizeIndex(4, 1)).toBe(5);
		expect(nextTextSizeIndex(5, -1)).toBe(4);
	});

	it('stops at the smallest and largest steps', () => {
		expect(nextTextSizeIndex(0, -1)).toBe(0);
		const last = TEXT_SIZE_STEPS.length - 1;
		expect(nextTextSizeIndex(last, 1)).toBe(last);
	});
});

describe('readTextSizeIndex', () => {
	it('reads a saved step', () => {
		expect(readTextSizeIndex('2')).toBe(2);
	});

	it('falls back to the default for missing or invalid values', () => {
		expect(readTextSizeIndex(null)).toBe(DEFAULT_TEXT_SIZE_INDEX);
		expect(readTextSizeIndex(undefined)).toBe(DEFAULT_TEXT_SIZE_INDEX);
		expect(readTextSizeIndex('')).toBe(DEFAULT_TEXT_SIZE_INDEX);
		expect(readTextSizeIndex('-1')).toBe(DEFAULT_TEXT_SIZE_INDEX);
		expect(readTextSizeIndex('1.5')).toBe(DEFAULT_TEXT_SIZE_INDEX);
		expect(readTextSizeIndex('99')).toBe(DEFAULT_TEXT_SIZE_INDEX);
		expect(readTextSizeIndex('large')).toBe(DEFAULT_TEXT_SIZE_INDEX);
	});
});

describe('textSizePercent', () => {
	it('formats the step as a percentage, with the default at 100%', () => {
		expect(textSizePercent(DEFAULT_TEXT_SIZE_INDEX)).toBe('100%');
		expect(textSizePercent(0)).toBe('50%');
		expect(textSizePercent(TEXT_SIZE_STEPS.length - 1)).toBe('150%');
	});
});
