import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSafeId } from '#lib/server/recipe-data.js';
import { getStore } from '#lib/server/store.js';
import { removeLine, type LinePart } from '#lib/server/remove-line.js';
import { addLines, type AddPart } from '#lib/server/add-lines.js';
import { decodeEntities } from '#lib/recipes/import.js';
import { MAX_TRANSLATED_TEXT } from '#lib/recipes/translation-fields.js';

/** Most lines one request adds. */
const MAX_NEW_LINES = 20;

/** The lines to add: non-empty text lines, trimmed and decoded, or null when the body is not valid. */
function newLines(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_NEW_LINES) return null;
	const lines: string[] = [];
	for (const item of value) {
		if (typeof item !== 'string') return null;
		const text = decodeEntities(item).trim();
		if (text === '' || text.length > MAX_TRANSLATED_TEXT) return null;
		lines.push(text);
	}
	return lines;
}

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

/** PUT /api/recipes/<id>/lines  body: { part, lines } -> appends lines to the original and aligned translations */
export const PUT: RequestHandler = async ({ params, request }) => {
	if (!isSafeId(params.id)) error(404, 'not found');
	const body = await request.json().catch(() => null);
	const part = body?.part;
	const lines = newLines(body?.lines);
	if ((part !== 'ingredients' && part !== 'steps') || lines === null) {
		return json({ error: 'line_invalid' }, { status: 400 });
	}
	// Where to insert: the given position, or the end when none is given.
	const at = body?.index === undefined ? undefined : body.index;
	if (at !== undefined && typeof at !== 'number')
		return json({ error: 'line_invalid' }, { status: 400 });
	const result = await addLines(getStore(), params.id, part as AddPart, lines, at);
	if (result === 'not_found') return json({ error: 'not_found' }, { status: 404 });
	if (result === 'bad_index') return json({ error: 'line_invalid' }, { status: 400 });
	if (result === 'too_many') return json({ error: 'line_limit' }, { status: 413 });
	return new Response(null, { status: 204 });
};
