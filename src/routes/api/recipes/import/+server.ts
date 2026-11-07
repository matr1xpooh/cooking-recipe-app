import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractRecipe, pageTitle } from '#lib/recipes/import.js';
import { fetchPublicPage, ImportError } from '#lib/server/recipe-import.js';

/** GET /api/recipes/import?url=… — fetches a page and returns the recipe it describes. */
export const GET: RequestHandler = async ({ url }) => {
	const target = url.searchParams.get('url') ?? '';
	try {
		const html = await fetchPublicPage(target);
		const recipe = extractRecipe(html);
		if (!recipe) throw new ImportError('no_recipe_found');
		return json({
			title: recipe.title || pageTitle(html),
			ingredients: recipe.ingredients,
			steps: recipe.steps
		});
	} catch (error) {
		if (error instanceof ImportError) {
			return json({ error: error.key }, { status: error.status });
		}
		throw error;
	}
};
