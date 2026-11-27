import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { decodeRecipeText, isRecipe } from '#lib/recipes/validate.js';
import { isSafeId } from '#lib/server/ids.js';
import { getStore } from '#lib/server/store.js';
import { recordUsage } from '#lib/server/usage.js';

/** GET /api/recipes -> all recipes, newest first */
export const GET: RequestHandler = async () => json(await getStore().listRecipes());

/** POST /api/recipes  body: a recipe -> adds it, or replaces the one with the same id */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => null);
	if (!isRecipe(body) || !isSafeId(body.id)) {
		return json({ error: 'recipe_invalid' }, { status: 400 });
	}
	const recipe = decodeRecipeText(body);
	if (recipe.sourceUrl) {
		const existing = await getStore().findSameRecipe(recipe);
		if (existing) {
			return json(
				{ error: 'duplicate', existing: { id: existing.id, title: existing.title } },
				{ status: 409 }
			);
		}
	}
	await getStore().saveRecipe(recipe);
	await recordUsage('recipe.saved', locals.user ?? undefined, { recipeId: recipe.id });
	return json({ ok: true });
};
