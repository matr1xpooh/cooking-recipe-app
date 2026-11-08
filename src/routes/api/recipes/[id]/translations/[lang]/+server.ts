import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isLanguage } from '#lib/recipes/languages.js';
import { isTranslatedFields } from '#lib/recipes/translation-fields.js';
import { isSafeId } from '#lib/server/recipe-data.js';
import { deleteOverride, getOverride, setOverride } from '#lib/server/translation-overrides.js';

function check(id: string, lang: string) {
	if (!isSafeId(id) || !isLanguage(lang)) error(404, 'not found');
	return lang;
}

/** GET /api/recipes/<id>/translations/<lang> -> the edited translation, or 404 */
export const GET: RequestHandler = async ({ params }) => {
	const lang = check(params.id, params.lang);
	const override = await getOverride(params.id, lang);
	if (!override) error(404, 'not found');
	return json(override);
};

/** PUT /api/recipes/<id>/translations/<lang>  body: { hash, fields } */
export const PUT: RequestHandler = async ({ params, request }) => {
	const lang = check(params.id, params.lang);
	const body = await request.json().catch(() => null);
	if (typeof body?.hash !== 'string' || body.hash.length > 64 || !isTranslatedFields(body.fields)) {
		return json({ error: 'translation_invalid' }, { status: 400 });
	}
	await setOverride(params.id, lang, { hash: body.hash, fields: body.fields });
	return new Response(null, { status: 204 });
};

/** DELETE /api/recipes/<id>/translations/<lang> -> back to the machine translation */
export const DELETE: RequestHandler = async ({ params }) => {
	const lang = check(params.id, params.lang);
	await deleteOverride(params.id, lang);
	return new Response(null, { status: 204 });
};
