import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSafeId } from '#lib/server/ids.js';
import { getStore } from '#lib/server/store.js';

/** DELETE /api/glossary/<id> -> removes a translation fix */
export const DELETE: RequestHandler = async ({ params }) => {
	if (!isSafeId(params.id)) error(404, 'not found');
	const removed = await getStore().deleteGlossaryRule(params.id);
	if (!removed) error(404, 'not found');
	return new Response(null, { status: 204 });
};
