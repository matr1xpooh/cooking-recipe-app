import { isIngredientSource, isTag, type IngredientSource, type Recipe, type Tag } from './recipe';

/** Checks a value has the shape of a stored recipe. Optional fields may be missing. */
export function isRecipe(value: unknown): value is Recipe {
	if (typeof value !== 'object' || value === null) return false;
	const r = value as Record<string, unknown>;
	return (
		typeof r.id === 'string' &&
		typeof r.title === 'string' &&
		(r.sourceUrl === null || typeof r.sourceUrl === 'string') &&
		Array.isArray(r.ingredients) &&
		r.ingredients.every((i) => typeof i === 'string') &&
		Array.isArray(r.steps) &&
		r.steps.every((s) => typeof s === 'string') &&
		typeof r.createdAt === 'string' &&
		typeof r.archived === 'boolean' &&
		(r.notes === undefined || typeof r.notes === 'string') &&
		(r.hasImage === undefined || typeof r.hasImage === 'boolean') &&
		(r.source === undefined || isIngredientSource(r.source)) &&
		(r.tags === undefined || (Array.isArray(r.tags) && r.tags.every(isTag))) &&
		(r.category === undefined || typeof r.category === 'string')
	);
}

/**
 * Returns a complete Recipe with only the known fields. Recipes saved before notes,
 * screenshots or sources existed get defaults rather than being dropped.
 */
/**
 * Tags of a stored recipe. Recipes from when there was one category keep it as
 * their only tag, and 'other' becomes no tags.
 */
function tagsOf(r: { tags?: unknown; category?: unknown }): Tag[] {
	if (Array.isArray(r.tags)) return r.tags.filter(isTag);
	return isTag(r.category) ? [r.category] : [];
}

export function normalizeRecipe(r: Recipe & { category?: unknown }): Recipe {
	const hasImage = r.hasImage === true;
	const source: IngredientSource = isIngredientSource(r.source)
		? r.source
		: hasImage
			? 'image'
			: 'typed';
	return {
		id: r.id,
		title: r.title,
		sourceUrl: r.sourceUrl,
		ingredients: r.ingredients,
		steps: r.steps,
		notes: r.notes ?? '',
		hasImage,
		source,
		tags: tagsOf(r),
		createdAt: r.createdAt,
		archived: r.archived
	};
}
