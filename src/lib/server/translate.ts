import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import { isLanguage, type Language } from '#lib/recipes/languages.js';
import { notesToHtml, htmlToNotes } from '#lib/recipes/notes-html.js';

export type TranslateErrorKey =
	'text_empty' | 'text_too_long' | 'language_unsupported' | 'translate_failed';

const STATUS: Record<TranslateErrorKey, number> = {
	text_empty: 400,
	text_too_long: 400,
	language_unsupported: 422,
	translate_failed: 502
};

export class TranslateError extends Error {
	readonly status: number;

	constructor(readonly key: TranslateErrorKey) {
		super(key);
		this.status = STATUS[key];
	}
}

/** Longest text sent for detection or translation, in characters. Keeps well under the 10 KB API limit. */
const MAX_CHARS = 4000;

// Created once per process. Credentials come from the default AWS chain
// (environment variables, then ~/.aws profiles, then instance or container roles).
let client: TranslateClient | undefined;
function translateClient(): TranslateClient {
	client ??= new TranslateClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
	return client;
}

/**
 * Detects the language of recipe text by asking Translate to translate it to
 * English with source "auto", then reading the detected source language back.
 */
export async function detectLanguage(text: string): Promise<Language> {
	const trimmed = text.trim();
	if (trimmed.length === 0) throw new TranslateError('text_empty');
	if (trimmed.length > MAX_CHARS) throw new TranslateError('text_too_long');

	const detected = await send({
		Text: trimmed,
		SourceLanguageCode: 'auto',
		TargetLanguageCode: 'en'
	});
	const code = detected.SourceLanguageCode?.split('-')[0];
	if (!isLanguage(code)) throw new TranslateError('language_unsupported');
	return code;
}

/** Translates notes from English to the target language, keeping their formatting. */
export async function translateNotes(notes: string, target: Language): Promise<string> {
	if (notes.trim().length === 0) return '';
	if (notes.length > MAX_CHARS) throw new TranslateError('text_too_long');
	if (target === 'en') return notes;

	const result = await send({
		Text: notesToHtml(notes),
		ContentType: 'text/html',
		SourceLanguageCode: 'en',
		TargetLanguageCode: target
	});
	return htmlToNotes(result.TranslatedText ?? '');
}

async function send(input: {
	Text: string;
	ContentType?: 'text/plain' | 'text/html';
	SourceLanguageCode: string;
	TargetLanguageCode: string;
}) {
	try {
		return await translateClient().send(new TranslateTextCommand(input));
	} catch {
		throw new TranslateError('translate_failed');
	}
}
