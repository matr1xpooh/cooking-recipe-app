import { LANGUAGES } from '#lib/recipes/languages.js';
import { MAX_TRANSLATED_LINES } from '#lib/recipes/translation-fields.js';
import type { RecipeStore } from './store';

export type AddPart = 'ingredients' | 'steps';

export type AddResult = 'added' | 'not_found' | 'too_many' | 'bad_index';

/**
 * Inserts lines into an ingredient or step list, in the original, at position `at` (the end when
 * omitted). Each translation that had the same lines as the original was before gets the same
 * lines at the same position, so it keeps its alignment. The new lines have no translation yet, so
 * a translation keeps its old source stamp and is flagged as out of date until it is reset.
 * Translations that did not fit are left alone.
 */
export async function addLines(
	store: RecipeStore,
	recipeId: string,
	part: AddPart,
	lines: string[],
	at?: number
): Promise<AddResult> {
	const recipe = (await store.listRecipes()).find((r) => r.id === recipeId);
	if (!recipe) return 'not_found';
	const before = recipe[part];
	const position = at ?? before.length;
	if (!Number.isInteger(position) || position < 0 || position > before.length) return 'bad_index';
	if (before.length + lines.length > MAX_TRANSLATED_LINES) return 'too_many';

	const insert = (list: string[]) => [
		...list.slice(0, position),
		...lines,
		...list.slice(position)
	];
	await store.saveRecipe({ ...recipe, [part]: insert(before) });

	for (const language of LANGUAGES) {
		const override = await store.getOverride(recipeId, language);
		if (!override || override.fields[part].length !== before.length) continue;
		await store.setOverride(recipeId, language, {
			hash: override.hash,
			fields: { ...override.fields, [part]: insert(override.fields[part]) }
		});
	}
	return 'added';
}
