import { describe, it, expect } from 'vitest';
import {
	translateItems,
	TranslateError,
	MAX_ITEMS,
	MAX_ITEM_CHARS,
	type TranslateCall,
	type TranslateCallInput
} from './translate';

/** Fake Translate: upper-cases the text so the tests can see what was translated. */
function fakeCall(seen: TranslateCallInput[] = []): TranslateCall {
	return async (input) => {
		seen.push(input);
		return input.Text.toUpperCase();
	};
}

describe('translateItems', () => {
	it('sends plain text as text/plain and returns the translation', async () => {
		const seen: TranslateCallInput[] = [];
		const out = await translateItems([{ text: 'flour', styled: false }], 'es', fakeCall(seen));
		expect(out).toEqual([{ text: 'FLOUR', failed: false }]);
		expect(seen[0]).toMatchObject({
			ContentType: 'text/plain',
			TargetLanguageCode: 'es',
			SourceLanguageCode: 'auto'
		});
	});

	it('sends styled text as HTML and converts the result back to markup', async () => {
		const seen: TranslateCallInput[] = [];
		const call: TranslateCall = async (input) => {
			seen.push(input);
			return '<b>fuego</b> lento';
		};
		const out = await translateItems([{ text: '**heat** slow', styled: true }], 'es', call);
		expect(seen[0].ContentType).toBe('text/html');
		expect(seen[0].Text).toBe('<b>heat</b> slow');
		expect(out).toEqual([{ text: '**fuego** lento', failed: false }]);
	});

	it('returns a failing item unchanged and still translates the others', async () => {
		const call: TranslateCall = async (input) => {
			if (input.Text === 'bad') throw new Error('boom');
			return input.Text.toUpperCase();
		};
		const out = await translateItems(
			[
				{ text: 'good', styled: false },
				{ text: 'bad', styled: false }
			],
			'ru',
			call
		);
		expect(out).toEqual([
			{ text: 'GOOD', failed: false },
			{ text: 'bad', failed: true }
		]);
	});

	it('skips blank items without calling Translate', async () => {
		const seen: TranslateCallInput[] = [];
		const out = await translateItems([{ text: '   ', styled: false }], 'ca', fakeCall(seen));
		expect(seen).toHaveLength(0);
		expect(out).toEqual([{ text: '   ', failed: false }]);
	});

	it('keeps at most four calls in flight', async () => {
		let inFlight = 0;
		let peak = 0;
		const call: TranslateCall = async (input) => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight--;
			return input.Text;
		};
		const items = Array.from({ length: 12 }, (_, i) => ({ text: `step ${i}`, styled: false }));
		const out = await translateItems(items, 'es', call);
		expect(out).toHaveLength(12);
		expect(peak).toBeLessThanOrEqual(4);
	});

	it('rejects too many items, and oversize items', async () => {
		const many = Array.from({ length: MAX_ITEMS + 1 }, () => ({ text: 'x', styled: false }));
		await expect(translateItems(many, 'es', fakeCall())).rejects.toMatchObject({
			key: 'too_many_items'
		});
		const big = [{ text: 'x'.repeat(MAX_ITEM_CHARS + 1), styled: false }];
		await expect(translateItems(big, 'es', fakeCall())).rejects.toBeInstanceOf(TranslateError);
	});
});
