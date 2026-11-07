import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { detectLanguage, TranslateError } from '#lib/server/translate.js';

/** POST /api/recipes/detect-language  body: { text } -> { language } */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const text = typeof body?.text === 'string' ? body.text : '';
	try {
		return json({ language: await detectLanguage(text) });
	} catch (error) {
		if (error instanceof TranslateError) {
			return json({ error: error.key }, { status: error.status });
		}
		throw error;
	}
};
