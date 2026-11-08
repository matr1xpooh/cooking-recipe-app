import { describe, it, expect } from 'vitest';
import {
	TranslationCache,
	TRANSLATION_CACHE_KEY,
	MAX_CACHE_ENTRIES,
	cacheKey
} from './translation-cache';
import { fieldsOf, fromTexts, hashItems, toItems, type RecipeFields } from './translation-fields';
import type { Recipe } from './recipe';
import type { KeyValueStorage } from './store.svelte';
import { translateFields, translateTitles } from './translate-client';

function memory(
	initial: Record<string, string> = {}
): KeyValueStorage & { data: Map<string, string> } {
	const data = new Map(Object.entries(initial));
	return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const recipe: Recipe = {
	id: 'r1',
	title: 'Soup',
	sourceUrl: null,
	sourceStart: null,
	ingredients: ['water', 'salt'],
	steps: ['**Boil** it'],
	notes: 'legacy *note*',
	images: [],
	source: 'typed',

	tags: [],
	createdAt: '2026-11-07T10:00:00.000Z',
	archived: false
};

describe('toItems / fromTexts', () => {
	it('flattens in order and rebuilds the same shape', () => {
		const fields = fieldsOf(recipe);
		const items = toItems(fields);
		expect(items.map((i) => [i.text, i.styled])).toEqual([
			['Soup', false],
			['water', false],
			['salt', false],
			['**Boil** it', true],
			['legacy *note*', true]
		]);
		expect(
			fromTexts(
				fields,
				items.map((i) => i.text)
			)
		).toEqual(fields);
	});

	it('maps translated texts back to the right fields', () => {
		const shape: RecipeFields = fieldsOf(recipe);
		const back = fromTexts(shape, ['Sopa', 'agua', 'sal', '**Hervir**', 'nota']);
		expect(back).toEqual({
			title: 'Sopa',
			ingredients: ['agua', 'sal'],
			steps: ['**Hervir**'],
			notes: 'nota'
		});
	});
});

describe('hashItems', () => {
	it('changes when the text changes and not otherwise', () => {
		const a = hashItems(toItems(fieldsOf(recipe)));
		expect(hashItems(toItems(fieldsOf(recipe)))).toBe(a);
		expect(hashItems(toItems({ ...fieldsOf(recipe), title: 'Stew' }))).not.toBe(a);
	});
});

describe('TranslationCache', () => {
	it('returns a stored translation only while the hash matches', () => {
		const cache = new TranslationCache(memory());
		cache.set('k', 'h1', ['Sopa']);
		expect(cache.get('k', 'h1')).toEqual(['Sopa']);
		expect(cache.get('k', 'h2')).toBeNull();
		expect(cache.get('other', 'h1')).toBeNull();
	});

	it('survives a reload (state is in storage)', () => {
		const storage = memory();
		new TranslationCache(storage).set('k', 'h', ['x']);
		expect(new TranslationCache(storage).get('k', 'h')).toEqual(['x']);
	});

	it('ignores corrupt stored data', () => {
		const cache = new TranslationCache(memory({ [TRANSLATION_CACHE_KEY]: '{bad' }));
		expect(cache.get('k', 'h')).toBeNull();
		cache.set('k', 'h', ['ok']);
		expect(cache.get('k', 'h')).toEqual(['ok']);
	});

	it('caps the number of entries, dropping the oldest', () => {
		const storage = memory();
		const cache = new TranslationCache(storage);
		for (let i = 0; i < MAX_CACHE_ENTRIES + 5; i++) cache.set(`k${i}`, 'h', ['t']);
		const stored = JSON.parse(storage.data.get(TRANSLATION_CACHE_KEY) ?? '{}');
		expect(Object.keys(stored)).toHaveLength(MAX_CACHE_ENTRIES);
		expect(cache.get('k0', 'h')).toBeNull();
		expect(cache.get(`k${MAX_CACHE_ENTRIES + 4}`, 'h')).toEqual(['t']);
	});

	it('does nothing without storage (server-side)', () => {
		const cache = new TranslationCache(null);
		cache.set('k', 'h', ['x']);
		expect(cache.get('k', 'h')).toBeNull();
	});

	it('keys by recipe, language and kind', () => {
		expect(cacheKey('r1', 'es', 'detail')).not.toBe(cacheKey('r1', 'es', 'title'));
		expect(cacheKey('r1', 'es', 'detail')).not.toBe(cacheKey('r1', 'ru', 'detail'));
	});
});

describe('translateFields / translateTitles', () => {
	const shape = fieldsOf(recipe);

	/** Fake server: echoes items upper-cased, marking any item containing "FAIL" as failed. */
	function fakeFetch(calls: unknown[][]) {
		return (async (_url: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			calls.push(body.items);
			// Like the server: a failed item comes back with its original text.
			const items = body.items.map((i: { text: string }) => {
				const failed = i.text.includes('FAIL');
				return { text: failed ? i.text : i.text.toUpperCase(), failed };
			});
			return new Response(JSON.stringify({ items }), { status: 200 });
		}) as typeof fetch;
	}

	it('translates once, then serves the second view from cache', async () => {
		const cache = new TranslationCache(memory());
		const calls: unknown[][] = [];
		const first = await translateFields(shape, 'r1', 'es', cache, fakeFetch(calls));
		expect(first.fields.title).toBe('SOUP');
		expect(first.failed).toBe(false);
		const second = await translateFields(shape, 'r1', 'es', cache, fakeFetch(calls));
		expect(second.fields.title).toBe('SOUP');
		expect(calls).toHaveLength(1);
	});

	it('does not cache a partial failure, so it is retried later', async () => {
		const cache = new TranslationCache(memory());
		const calls: unknown[][] = [];
		const withFail = { ...shape, title: 'FAIL me' };
		const out = await translateFields(withFail, 'r1', 'es', cache, fakeFetch(calls));
		expect(out.failed).toBe(true);
		expect(out.fields.title).toBe('FAIL me');
		await translateFields(withFail, 'r1', 'es', cache, fakeFetch(calls));
		expect(calls).toHaveLength(2);
	});

	it('falls back to the original when the request itself fails', async () => {
		const cache = new TranslationCache(memory());
		const broken = (async () => new Response('{}', { status: 502 })) as typeof fetch;
		const out = await translateFields(shape, 'r1', 'es', cache, broken);
		expect(out).toEqual({ fields: shape, failed: true });
	});

	it('translates titles in one batch and reuses them afterwards', async () => {
		const cache = new TranslationCache(memory());
		const calls: unknown[][] = [];
		const list = [recipe, { ...recipe, id: 'r2', title: 'Stew' }];
		const map = await translateTitles(list, 'ru', cache, fakeFetch(calls));
		expect(map).toEqual({ r1: 'SOUP', r2: 'STEW' });
		expect(calls).toHaveLength(1);
		await translateTitles(list, 'ru', cache, fakeFetch(calls));
		expect(calls).toHaveLength(1);
	});
});
