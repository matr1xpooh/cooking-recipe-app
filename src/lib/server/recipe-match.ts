import type { Recipe } from '#lib/recipes/recipe.js';
import { normalizeSourceUrl } from '#lib/recipes/recipe.js';

/**
 * Duplicate and address rules over a list of recipes. Shared by every store, so the
 * rules are written once.
 */

/**
 * The saved recipe with the same address as `url`, other than `exceptId`. When a start
 * time is given, only a recipe with that start time counts: one video can hold several
 * dishes, each with its own start.
 */
export function matchByUrl(
	all: Recipe[],
	url: string,
	exceptId?: string,
	start?: number | null
): Recipe | undefined {
	const key = normalizeSourceUrl(url);
	return all.find(
		(r) =>
			r.id !== exceptId &&
			r.sourceUrl !== null &&
			normalizeSourceUrl(r.sourceUrl) === key &&
			(start === undefined || (r.sourceStart ?? null) === start)
	);
}

/**
 * A saved recipe that is the same dish as `recipe`: same address, same start time and
 * same title. One video can hold several dishes, so the address alone is not enough.
 */
export function matchSame(all: Recipe[], recipe: Recipe): Recipe | undefined {
	if (!recipe.sourceUrl) return undefined;
	const key = normalizeSourceUrl(recipe.sourceUrl);
	const title = recipe.title.trim().toLowerCase();
	return all.find(
		(r) =>
			r.id !== recipe.id &&
			r.sourceUrl !== null &&
			normalizeSourceUrl(r.sourceUrl) === key &&
			(r.sourceStart ?? null) === (recipe.sourceStart ?? null) &&
			r.title.trim().toLowerCase() === title
	);
}
