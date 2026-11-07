import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	extractRecipe,
	extractYouTubeDescription,
	isYouTubeUrl,
	pageTitle,
	parseDescription,
	type ImportedRecipe
} from '#lib/recipes/import.js';
import { fetchPublicPage, ImportError, parseHttpUrl } from '#lib/server/recipe-import.js';

/**
 * Recipe from schema.org data, or, for YouTube, from the video description
 * when it has ingredient and step headings.
 */
function recipeFromPage(url: URL, html: string): ImportedRecipe {
	const fromData = extractRecipe(html);
	if (fromData) return fromData;

	if (isYouTubeUrl(url)) {
		const description = extractYouTubeDescription(html);
		if (description === null) throw new ImportError('no_recipe_found');
		const parsed = parseDescription(description);
		if (!parsed) throw new ImportError('description_not_parsed');
		return { title: '', ...parsed };
	}

	throw new ImportError('no_recipe_found');
}

/** GET /api/recipes/import?url=… — fetches a page and returns the recipe it describes. */
export const GET: RequestHandler = async ({ url }) => {
	const target = url.searchParams.get('url') ?? '';
	try {
		const pageUrl = parseHttpUrl(target);
		const html = await fetchPublicPage(target);
		const recipe = recipeFromPage(pageUrl, html);
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
