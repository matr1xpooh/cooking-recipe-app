import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isLanguage } from '#lib/recipes/languages.js';
import { translateCached, TranslateError, type TranslateItem } from '#lib/server/translate.js';
import { LIMITS, takeToken } from '#lib/server/rate-limit.js';
import { getStore } from '#lib/server/store.js';

function parseItems(value: unknown): TranslateItem[] | null {
	if (!Array.isArray(value)) return null;
	const items: TranslateItem[] = [];
	for (const raw of value) {
		if (typeof raw !== 'object' || raw === null) return null;
		const { text, styled } = raw as Record<string, unknown>;
		if (typeof text !== 'string' || typeof styled !== 'boolean') return null;
		items.push({ text, styled });
	}
	return items;
}

/** POST /api/recipes/translate  body: { target, items: [{ text, styled }] } -> { items: [{ text, failed }] } */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!takeToken(`translate:${locals.user?.sub ?? 'anon'}`, LIMITS.translate)) {
		return json({ error: 'rate_limited' }, { status: 429 });
	}
	const body = await request.json().catch(() => null);
	const items = parseItems(body?.items);
	if (!items || !isLanguage(body?.target)) {
		return json({ error: 'request_invalid' }, { status: 400 });
	}
	try {
		return json({ items: await translateCached(items, body.target, getStore()) });
	} catch (error) {
		if (error instanceof TranslateError) {
			return json({ error: error.key }, { status: error.status });
		}
		throw error;
	}
};
