import { createHash } from 'node:crypto';
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import type { Language } from '#lib/recipes/languages.js';
import type { TranslateItem, TranslatedItem } from '#lib/recipes/translation-types.js';
import { notesToHtml, htmlToNotes } from '#lib/recipes/notes-html.js';

export type { TranslateItem, TranslatedItem } from '#lib/recipes/translation-types.js';

export interface TranslateCallInput {
	Text: string;
	ContentType: 'text/plain' | 'text/html';
	SourceLanguageCode: string;
	TargetLanguageCode: string;
}

/** Performs one TranslateText call and returns the translated text. Throws on failure. */
export type TranslateCall = (input: TranslateCallInput) => Promise<string>;

export type TranslateErrorKey = 'too_many_items' | 'text_too_long';

const STATUS: Record<TranslateErrorKey, number> = {
	too_many_items: 400,
	text_too_long: 400
};

export class TranslateError extends Error {
	readonly status: number;

	constructor(readonly key: TranslateErrorKey) {
		super(key);
		this.status = STATUS[key];
	}
}

/** Limits keep one request well under Translate's per-call size limit and bound the spend. */
export const MAX_ITEMS = 40;
export const MAX_ITEM_CHARS = 4000;
export const MAX_TOTAL_CHARS = 20000;
const CONCURRENCY = 4;

// Created once per process. Credentials come from the default AWS chain
// (environment variables, then ~/.aws profiles, then instance or container roles).
let client: TranslateClient | undefined;
const awsCall: TranslateCall = async (input) => {
	client ??= new TranslateClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
	const out = await client.send(new TranslateTextCommand(input));
	return out.TranslatedText ?? '';
};

function checkLimits(items: TranslateItem[]): void {
	if (items.length > MAX_ITEMS) throw new TranslateError('too_many_items');
	let total = 0;
	for (const item of items) {
		if (item.text.length > MAX_ITEM_CHARS) throw new TranslateError('text_too_long');
		total += item.text.length;
	}
	if (total > MAX_TOTAL_CHARS) throw new TranslateError('text_too_long');
}

/** The part of the store that holds machine translations, keyed by text and target language. */
export interface TranslationCacheStore {
	getCachedTranslation(key: string): Promise<string | undefined>;
	setCachedTranslation(key: string, text: string): Promise<void>;
}

/**
 * Cache key for one item: a SHA-256 of the target, the style flag and the text. Two
 * recipes with the same sentence share one translation; any change to the text misses.
 */
export function cacheKeyFor(item: TranslateItem, target: Language): string {
	const digest = createHash('sha256')
		.update(JSON.stringify([target, item.styled, item.text]))
		.digest('hex');
	return `tr:${digest}`;
}

/**
 * Like translateItems, but serves items already translated for `target` from the cache
 * and only sends the rest to Translate. Only successful translations are stored, so a
 * failed item is tried again next time. A cache that cannot be read or written only
 * costs a repeat call, so its errors do not fail the request.
 */
export async function translateCached(
	items: TranslateItem[],
	target: Language,
	cache: TranslationCacheStore,
	call: TranslateCall = awsCall
): Promise<TranslatedItem[]> {
	checkLimits(items);
	const results: TranslatedItem[] = new Array(items.length);
	const misses: number[] = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (item.text.trim().length === 0) {
			results[i] = { text: item.text, failed: false };
			continue;
		}
		const hit = await cache.getCachedTranslation(cacheKeyFor(item, target)).catch(() => undefined);
		if (hit !== undefined) results[i] = { text: hit, failed: false };
		else misses.push(i);
	}

	const fresh = await translateItems(
		misses.map((i) => items[i]),
		target,
		call
	);
	for (let k = 0; k < misses.length; k++) {
		const i = misses[k];
		results[i] = fresh[k];
		if (!fresh[k].failed) {
			await cache
				.setCachedTranslation(cacheKeyFor(items[i], target), fresh[k].text)
				.catch(() => undefined);
		}
	}
	return results;
}

/**
 * Translates recipe text into `target`, one call per item, with a small concurrency
 * limit. Source language is detected per item by Translate. An item that fails is
 * returned unchanged with `failed: true`; the rest still translate.
 */
export async function translateItems(
	items: TranslateItem[],
	target: Language,
	call: TranslateCall = awsCall
): Promise<TranslatedItem[]> {
	checkLimits(items);

	const results: TranslatedItem[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await translateOne(items[index], target, call);
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
	return results;
}

/**
 * Translates with automatic language detection. Short text can be detected as a language
 * Translate does not support (for example "cv" for Russian). Cyrillic text is Russian here,
 * so that case is retried with Russian as the source; anything else is left to fail.
 */
async function translateWithFallback(
	call: TranslateCall,
	input: Omit<TranslateCallInput, 'SourceLanguageCode'>
): Promise<string> {
	try {
		return await call({ ...input, SourceLanguageCode: 'auto' });
	} catch (error) {
		const unsupported = error instanceof Error && error.name === 'UnsupportedLanguagePairException';
		if (unsupported && /\p{Script=Cyrillic}/u.test(input.Text)) {
			return call({ ...input, SourceLanguageCode: 'ru' });
		}
		throw error;
	}
}

async function translateOne(
	item: TranslateItem,
	target: Language,
	call: TranslateCall
): Promise<TranslatedItem> {
	if (item.text.trim().length === 0) return { text: item.text, failed: false };
	try {
		if (item.styled) {
			const translated = await translateWithFallback(call, {
				Text: notesToHtml(item.text),
				ContentType: 'text/html',
				TargetLanguageCode: target
			});
			return { text: htmlToNotes(translated), failed: false };
		}
		const translated = await translateWithFallback(call, {
			Text: item.text,
			ContentType: 'text/plain',
			TargetLanguageCode: target
		});
		return { text: translated, failed: false };
	} catch (error) {
		// Logs the error's name and message only, never the text being translated.
		console.error(
			'translate item failed:',
			error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'
		);
		return { text: item.text, failed: true };
	}
}
