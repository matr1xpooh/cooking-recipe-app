import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isLanguage } from '#lib/recipes/languages.js';
import { getStore } from '#lib/server/store.js';

/**
 * PUT /api/me/language  body: { language } -> 204
 * Remembers the signed-in user's language, so it follows them to other devices. The
 * language cookie stays the fast path; this is read only when the cookie is missing.
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => null);
	if (!isLanguage(body?.language)) {
		return json({ error: 'request_invalid' }, { status: 400 });
	}
	await getStore().setUserLanguage(locals.user!.sub, body.language);
	return new Response(null, { status: 204 });
};
