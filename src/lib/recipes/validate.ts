import {
	isBuiltInTag,
	isIngredientSource,
	normalizeTags,
	type IngredientSource,
	type Recipe,
	type Tag
} from './recipe';

/** Checks a value has the shape of a stored recipe. Optional fields may be missing. */
export function isRecipe(value: unknown): value is Recipe {
	if (typeof value !== 'object' || value === null) return false;
	const r = value as Record<string, unknown>;
	return (
		typeof r.id === 'string' &&
		typeof r.title === 'string' &&
		(r.sourceUrl === null || typeof r.sourceUrl === 'string') &&
		(r.sourceStart === undefined || r.sourceStart === null || typeof r.sourceStart === 'number') &&
		Array.isArray(r.ingredients) &&
		r.ingredients.every((i) => typeof i === 'string') &&
		Array.isArray(r.steps) &&
		r.steps.every((s) => typeof s === 'string') &&
		typeof r.createdAt === 'string' &&
		typeof r.archived === 'boolean' &&
		(r.notes === undefined || typeof r.notes === 'string') &&
		(r.images === undefined ||
			(Array.isArray(r.images) && r.images.every((i) => typeof i === 'string'))) &&
		(r.hasImage === undefined || typeof r.hasImage === 'boolean') &&
		(r.source === undefined || isIngredientSource(r.source)) &&
		(r.tags === undefined ||
			(Array.isArray(r.tags) && r.tags.every((t) => typeof t === 'string'))) &&
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
	if (Array.isArray(r.tags)) return normalizeTags(r.tags);
	return isBuiltInTag(r.category) ? [r.category] : [];
}

/** Image ids from a stored recipe. A recipe with the old single screenshot gets it as image 'legacy'. */
function imagesOf(r: { images?: unknown; hasImage?: unknown }): string[] {
	if (Array.isArray(r.images))
		return r.images.filter(
			(i): i is string => typeof i === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(i)
		);
	return r.hasImage === true ? ['legacy'] : [];
}

export function normalizeRecipe(r: Recipe & { category?: unknown; hasImage?: unknown }): Recipe {
	const images = imagesOf(r);
	const source: IngredientSource = isIngredientSource(r.source)
		? r.source
		: images.length > 0
			? 'image'
			: 'typed';
	return {
		id: r.id,
		title: r.title,
		sourceUrl: r.sourceUrl,
		sourceStart: typeof r.sourceStart === 'number' ? r.sourceStart : null,
		ingredients: r.ingredients,
		steps: r.steps,
		notes: r.notes ?? '',
		images,
		source,
		tags: tagsOf(r),
		createdAt: r.createdAt,
		archived: r.archived
	};
}
