import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	extractRecipe,
	extractYouTubeDescription,
	isYouTubeUrl,
	pageImage,
	pageTitle,
	parseDescription,
	type ImportedRecipe
} from '#lib/recipes/import.js';
import { fetchPublicPage, ImportError, parseHttpUrl } from '#lib/server/recipe-import.js';
import { getStore } from '#lib/server/store.js';
import { LIMITS, takeToken } from '#lib/server/rate-limit.js';
import { parseStart } from '#lib/recipes/recipe.js';

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
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!takeToken(`import:${locals.user?.sub ?? 'anon'}`, LIMITS.import)) {
		return json({ error: 'rate_limited' }, { status: 429 });
	}
	const target = url.searchParams.get('url') ?? '';
	try {
		const pageUrl = parseHttpUrl(target);
		// Check before fetching: a page already saved is shown, not imported again.
		const start = parseStart(url.searchParams.get('start') ?? '');
		const existing = await getStore().findRecipeByUrl(
			target,
			url.searchParams.get('exceptId') ?? undefined,
			start === undefined ? null : start
		);
		if (existing) {
			return json(
				{ error: 'duplicate', existing: { id: existing.id, title: existing.title } },
				{ status: 409 }
			);
		}
		const html = await fetchPublicPage(target);
		const recipe = recipeFromPage(pageUrl, html);
		// Pictures: the recipe's own, else the page's og:image. YouTube's image is a video
		// thumbnail, so it is not used.
		const picture = recipe.image ?? (isYouTubeUrl(pageUrl) ? undefined : pageImage(html));
		return json({
			title: recipe.title || pageTitle(html),
			ingredients: recipe.ingredients,
			steps: recipe.steps,
			imageUrl: picture ? new URL(picture, pageUrl).toString() : null
		});
	} catch (error) {
		if (error instanceof ImportError) {
			return json({ error: error.key }, { status: error.status });
		}
		throw error;
	}
};
