import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSafeId } from '#lib/server/recipe-data.js';
import { getStore } from '#lib/server/store.js';

/** DELETE /api/recipes/<id> -> removes the recipe and its stored screenshot */
export const DELETE: RequestHandler = async ({ params }) => {
	if (!isSafeId(params.id)) error(404, 'not found');
	const store = getStore();
	const removed = await store.deleteRecipe(params.id);
	if (removed) await store.removeOverridesFor(params.id);
	if (!removed) return json({ error: 'not_found' }, { status: 404 });
	return new Response(null, { status: 204 });
};
