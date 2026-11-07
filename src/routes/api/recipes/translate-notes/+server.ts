import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isLanguage } from '#lib/recipes/languages.js';
import { translateNotes, TranslateError } from '#lib/server/translate.js';

/** POST /api/recipes/translate-notes  body: { notes, target } -> { notes } */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const notes = typeof body?.notes === 'string' ? body.notes : '';
	if (!isLanguage(body?.target)) {
		return json({ error: 'language_unsupported' }, { status: 422 });
	}
	try {
		return json({ notes: await translateNotes(notes, body.target) });
	} catch (error) {
		if (error instanceof TranslateError) {
			return json({ error: error.key }, { status: error.status });
		}
		throw error;
	}
};
