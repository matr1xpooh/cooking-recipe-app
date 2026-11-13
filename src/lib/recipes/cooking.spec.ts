import { describe, expect, it } from 'vitest';
import { clampStep, cookSteps } from './cooking';

describe('cookSteps', () => {
	it('keeps each step with the notes written under it', () => {
		const steps = cookSteps(['Chop onions', '> keep the skins', 'Fry gently', '> low heat']);
		expect(steps).toEqual([
			{ text: 'Chop onions', notes: [{ bullet: false, text: 'keep the skins' }] },
			{ text: 'Fry gently', notes: [{ bullet: false, text: 'low heat' }] }
		]);
	});

	it('drops notes that come before the first step', () => {
		const steps = cookSteps(['> preheat first', 'Mix']);
		expect(steps.map((s) => s.text)).toEqual(['Mix']);
	});

	it('returns no steps for an empty list', () => {
		expect(cookSteps([])).toEqual([]);
	});
});

describe('clampStep', () => {
	it('keeps the index inside the list', () => {
		expect(clampStep(0, 3)).toBe(0);
		expect(clampStep(2, 3)).toBe(2);
		expect(clampStep(-1, 3)).toBe(0);
		expect(clampStep(5, 3)).toBe(2);
	});

	it('stays at 0 when there are no steps', () => {
		expect(clampStep(4, 0)).toBe(0);
	});
});
