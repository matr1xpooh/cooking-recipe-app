import { LANGUAGES } from '#lib/recipes/languages.js';
import { fromNoteLine, isHeading, toNoteLine } from '#lib/recipes/ingredient-lines.js';
import { sourceHash } from '#lib/recipes/translation-fields.js';
import type { RecipeStore } from './store';

export type NotePart = 'ingredients' | 'steps';

export type SetNoteResult = 'changed' | 'not_found' | 'bad_index' | 'heading';

/** Changes one line between a step and a note under the step above, in every language. */
function mapLine(line: string, asNote: boolean): string {
	return asNote ? toNoteLine(fromNoteLine(line)) : fromNoteLine(line);
}

/**
 * Makes one ingredient or step a note of the line above (asNote), or a plain line again. The
 * original changes, and each translation with the same lines gets the same change. A translation
 * that was up to date takes the new source stamp. A heading cannot change, and a note needs a line
 * above it.
 */
export async function setLineNote(
	store: RecipeStore,
	recipeId: string,
	part: NotePart,
	index: number,
	asNote: boolean
): Promise<SetNoteResult> {
	const recipe = (await store.listRecipes()).find((r) => r.id === recipeId);
	if (!recipe) return 'not_found';
	const lines = recipe[part];
	if (!Number.isInteger(index) || index < 0 || index >= lines.length) return 'bad_index';
	if (isHeading(lines[index])) return 'heading';
	if (asNote && index === 0) return 'bad_index';

	const oldStamp = sourceHash(recipe);
	const changedLines = lines.map((line, i) => (i === index ? mapLine(line, asNote) : line));
	const updated = { ...recipe, [part]: changedLines };
	const newStamp = sourceHash(updated);
	await store.saveRecipe(updated);

	for (const language of LANGUAGES) {
		const override = await store.getOverride(recipeId, language);
		if (!override || override.fields[part].length !== lines.length) continue;
		const translated = override.fields[part].map((line, i) =>
			i === index ? mapLine(line, asNote) : line
		);
		await store.setOverride(recipeId, language, {
			hash: override.hash === oldStamp ? newStamp : override.hash,
			fields: { ...override.fields, [part]: translated }
		});
	}
	return 'changed';
}
