import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isRecipe } from '#lib/recipes/validate.js';
import { isSafeId, listRecipes, saveRecipe } from '#lib/server/recipe-data.js';

/** GET /api/recipes -> all recipes, newest first */
export const GET: RequestHandler = async () => json(await listRecipes());

/** POST /api/recipes  body: a recipe -> adds it, or replaces the one with the same id */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!isRecipe(body) || !isSafeId(body.id)) {
		return json({ error: 'recipe_invalid' }, { status: 400 });
	}
	await saveRecipe(body);
	return json({ ok: true });
};
