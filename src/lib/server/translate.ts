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
	if (items.length > MAX_ITEMS) throw new TranslateError('too_many_items');
	let total = 0;
	for (const item of items) {
		if (item.text.length > MAX_ITEM_CHARS) throw new TranslateError('text_too_long');
		total += item.text.length;
	}
	if (total > MAX_TOTAL_CHARS) throw new TranslateError('text_too_long');

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

async function translateOne(
	item: TranslateItem,
	target: Language,
	call: TranslateCall
): Promise<TranslatedItem> {
	if (item.text.trim().length === 0) return { text: item.text, failed: false };
	try {
		if (item.styled) {
			const translated = await call({
				Text: notesToHtml(item.text),
				ContentType: 'text/html',
				SourceLanguageCode: 'auto',
				TargetLanguageCode: target
			});
			return { text: htmlToNotes(translated), failed: false };
		}
		const translated = await call({
			Text: item.text,
			ContentType: 'text/plain',
			SourceLanguageCode: 'auto',
			TargetLanguageCode: target
		});
		return { text: translated, failed: false };
	} catch {
		return { text: item.text, failed: true };
	}
}
