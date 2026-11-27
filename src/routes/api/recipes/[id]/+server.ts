import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSafeId } from '#lib/server/ids.js';
import { getStore } from '#lib/server/store.js';
import { recordUsage } from '#lib/server/usage.js';

/** DELETE /api/recipes/<id> -> removes the recipe and its stored screenshot */
export const DELETE: RequestHandler = async ({ params }) => {
	if (!isSafeId(params.id)) error(404, 'not found');
	const store = getStore();
	const removed = await store.deleteRecipe(params.id);
	if (removed) await store.removeOverridesFor(params.id);
	if (!removed) return json({ error: 'not_found' }, { status: 404 });
	await recordUsage('recipe.deleted');
	return new Response(null, { status: 204 });
};
