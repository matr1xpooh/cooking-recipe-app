import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSafeId } from '#lib/server/recipe-data.js';
import { getStore } from '#lib/server/store.js';
import { removeLine, type LinePart } from '#lib/server/remove-line.js';

/** POST /api/recipes/<id>/lines  body: { part, index } -> deletes that line in every language */
export const POST: RequestHandler = async ({ params, request }) => {
	if (!isSafeId(params.id)) error(404, 'not found');
	const body = await request.json().catch(() => null);
	const part = body?.part;
	if ((part !== 'ingredients' && part !== 'steps') || typeof body?.index !== 'number') {
		return json({ error: 'line_invalid' }, { status: 400 });
	}
	const removed = await removeLine(getStore(), params.id, part as LinePart, body.index);
	if (!removed) return json({ error: 'not_found' }, { status: 404 });
	return new Response(null, { status: 204 });
};
