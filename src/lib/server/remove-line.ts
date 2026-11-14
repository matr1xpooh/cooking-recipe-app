import { LANGUAGES } from '#lib/recipes/languages.js';
import { lineRange, removeRange } from '#lib/recipes/ingredient-lines.js';
import { sourceHash } from '#lib/recipes/translation-fields.js';
import type { RecipeStore } from './store';

export type LinePart = 'ingredients' | 'steps';

/**
 * Deletes one ingredient or step from a recipe in every language. The original loses the line and
 * its notes. A translation loses the same lines, but only when it has the same lines as the
 * original was before (otherwise it is left alone and shown as not fitting). A translation that was
 * up to date stays up to date, so it takes the new source stamp. Returns false when the recipe or
 * the line does not exist.
 */
export async function removeLine(
	store: RecipeStore,
	recipeId: string,
	part: LinePart,
	index: number
): Promise<boolean> {
	const recipe = (await store.listRecipes()).find((r) => r.id === recipeId);
	if (!recipe) return false;
	const lines = recipe[part];
	if (!Number.isInteger(index) || index < 0 || index >= lines.length) return false;

	const range = lineRange(lines, index);
	const oldStamp = sourceHash(recipe);
	const updated = { ...recipe, [part]: removeRange(lines, range) };
	const newStamp = sourceHash(updated);
	await store.saveRecipe(updated);

	for (const language of LANGUAGES) {
		const override = await store.getOverride(recipeId, language);
		if (!override || override.fields[part].length !== lines.length) continue;
		await store.setOverride(recipeId, language, {
			hash: override.hash === oldStamp ? newStamp : override.hash,
			fields: { ...override.fields, [part]: removeRange(override.fields[part], range) }
		});
	}
	return true;
}
