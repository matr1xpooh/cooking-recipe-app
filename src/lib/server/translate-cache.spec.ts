import { describe, it, expect } from 'vitest';
import {
	cacheKeyFor,
	translateCached,
	type TranslateCall,
	type TranslateCallInput,
	type TranslationCacheStore
} from './translate';

/** A cache held in a Map, so tests can see what was stored. */
function memoryCache(entries = new Map<string, string>()): TranslationCacheStore & {
	entries: Map<string, string>;
} {
	return {
		entries,
		async getCachedTranslation(key) {
			return entries.get(key);
		},
		async setCachedTranslation(key, text) {
			entries.set(key, text);
		}
	};
}

/** Fake Translate: upper-cases the text and counts calls. */
function countingCall(calls: TranslateCallInput[]): TranslateCall {
	return async (input) => {
		calls.push(input);
		return input.Text.toUpperCase();
	};
}

describe('translateCached', () => {
	it('translates on a miss and stores the result for next time', async () => {
		const cache = memoryCache();
		const calls: TranslateCallInput[] = [];
		const out = await translateCached(
			[{ text: 'flour', styled: false }],
			'es',
			cache,
			countingCall(calls)
		);
		expect(out).toEqual([{ text: 'FLOUR', failed: false }]);
		expect(calls).toHaveLength(1);
		expect(cache.entries.get(cacheKeyFor({ text: 'flour', styled: false }, 'es'))).toBe('FLOUR');
	});

	it('serves a repeat from the cache without calling Translate', async () => {
		const cache = memoryCache();
		const calls: TranslateCallInput[] = [];
		const call = countingCall(calls);
		await translateCached([{ text: 'flour', styled: false }], 'es', cache, call);
		const again = await translateCached([{ text: 'flour', styled: false }], 'es', cache, call);
		expect(again).toEqual([{ text: 'FLOUR', failed: false }]);
		expect(calls).toHaveLength(1);
	});

	it('keeps translations apart by target language', async () => {
		const cache = memoryCache();
		const calls: TranslateCallInput[] = [];
		const call = countingCall(calls);
		await translateCached([{ text: 'salt', styled: false }], 'es', cache, call);
		await translateCached([{ text: 'salt', styled: false }], 'ca', cache, call);
		expect(calls.map((c) => c.TargetLanguageCode)).toEqual(['es', 'ca']);
	});

	it('keeps styled and plain text apart, since they are sent differently', async () => {
		const plain = cacheKeyFor({ text: '**heat**', styled: false }, 'es');
		const styled = cacheKeyFor({ text: '**heat**', styled: true }, 'es');
		expect(plain).not.toBe(styled);
	});

	it('does not cache a failed item, so it is tried again', async () => {
		const cache = memoryCache();
		const failing: TranslateCall = async () => {
			throw new Error('down');
		};
		const out = await translateCached([{ text: 'salt', styled: false }], 'es', cache, failing);
		expect(out).toEqual([{ text: 'salt', failed: true }]);
		expect(cache.entries.size).toBe(0);
	});

	it('only sends the items that are not cached, and keeps the order', async () => {
		const cache = memoryCache();
		const calls: TranslateCallInput[] = [];
		const call = countingCall(calls);
		await translateCached([{ text: 'b', styled: false }], 'es', cache, call);
		calls.length = 0;
		const out = await translateCached(
			[
				{ text: 'a', styled: false },
				{ text: 'b', styled: false },
				{ text: 'c', styled: false }
			],
			'es',
			cache,
			call
		);
		expect(calls.map((c) => c.Text)).toEqual(['a', 'c']);
		expect(out.map((t) => t.text)).toEqual(['A', 'B', 'C']);
	});

	it('does not call Translate for blank text', async () => {
		const calls: TranslateCallInput[] = [];
		const out = await translateCached(
			[{ text: '   ', styled: false }],
			'es',
			memoryCache(),
			countingCall(calls)
		);
		expect(out).toEqual([{ text: '   ', failed: false }]);
		expect(calls).toHaveLength(0);
	});

	it('still translates when the cache cannot be read or written', async () => {
		const broken: TranslationCacheStore = {
			async getCachedTranslation() {
				throw new Error('store down');
			},
			async setCachedTranslation() {
				throw new Error('store down');
			}
		};
		const out = await translateCached(
			[{ text: 'flour', styled: false }],
			'es',
			broken,
			countingCall([])
		);
		expect(out).toEqual([{ text: 'FLOUR', failed: false }]);
	});
});
