import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteRecipe, isSafeId } from '#lib/server/recipe-data.js';
import { removeOverridesFor } from '#lib/server/translation-overrides.js';

/** DELETE /api/recipes/<id> -> removes the recipe and its stored screenshot */
export const DELETE: RequestHandler = async ({ params }) => {
	if (!isSafeId(params.id)) error(404, 'not found');
	const removed = await deleteRecipe(params.id);
	if (removed) await removeOverridesFor(params.id);
	if (!removed) return json({ error: 'not_found' }, { status: 404 });
	return new Response(null, { status: 204 });
};
