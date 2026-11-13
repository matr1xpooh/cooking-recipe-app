import { describe, it, expect } from 'vitest';
import { translateItems, type TranslateCall, type TranslateCallInput } from './translate';

/** Like Translate: detection of short Cyrillic text picks "cv", which is unsupported. */
function detectingCall(seen: TranslateCallInput[]): TranslateCall {
	return async (input) => {
		seen.push(input);
		if (input.SourceLanguageCode === 'auto' && /[Ѐ-ӿ]/.test(input.Text)) {
			const error = new Error('Unsupported language pair: cv to en.');
			error.name = 'UnsupportedLanguagePairException';
			throw error;
		}
		return `[${input.SourceLanguageCode}] ${input.Text}`;
	};
}

describe('translateItems language fallback', () => {
	it('retries Cyrillic text with Russian when detection is unsupported', async () => {
		const seen: TranslateCallInput[] = [];
		const out = await translateItems(
			[{ text: 'Рисовые шарики', styled: false }],
			'ca',
			detectingCall(seen)
		);
		expect(out).toEqual([{ text: '[ru] Рисовые шарики', failed: false }]);
		expect(seen.map((s) => s.SourceLanguageCode)).toEqual(['auto', 'ru']);
	});

	it('still reports an unsupported pair for text that is not Cyrillic', async () => {
		const seen: TranslateCallInput[] = [];
		const call: TranslateCall = async (input) => {
			seen.push(input);
			const error = new Error('Unsupported language pair');
			error.name = 'UnsupportedLanguagePairException';
			throw error;
		};
		const out = await translateItems([{ text: 'tuna', styled: false }], 'ca', call);
		expect(out).toEqual([{ text: 'tuna', failed: true }]);
		expect(seen).toHaveLength(1);
	});
});
