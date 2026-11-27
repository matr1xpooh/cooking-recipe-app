import { LANGUAGES } from '#lib/recipes/languages.js';
import {
	HEADING_MARKER,
	fromNoteLine,
	headingText,
	isHeading,
	isNote,
	toNoteLine
} from '#lib/recipes/ingredient-lines.js';
import { sourceHash } from '#lib/recipes/translation-fields.js';
import type { RecipeStore } from './store';

export type NotePart = 'ingredients' | 'steps';

/** What a line is: a step or ingredient, a tip under the line above, or a section heading. */
export type LineKind = 'step' | 'tip' | 'section';

export type SetNoteResult = 'changed' | 'not_found' | 'bad_index' | 'heading' | 'has_tips';

/** The line in the new kind. The text stays; only the marker changes. */
function asKind(line: string, kind: LineKind): string {
	if (kind === 'tip') return toNoteLine(headingText(fromNoteLine(line)));
	if (kind === 'section') return HEADING_MARKER + headingText(fromNoteLine(line));
	return headingText(fromNoteLine(line));
}

/**
 * Changes one ingredient or step to another kind, in every language: a step, a tip (a note of the
 * line above), or a section heading. The text stays the same. Each translation with the same lines
 * gets the same change. A translation that was up to date takes the new source stamp.
 *
 * A section cannot be made from a line with tips under it (a tip belongs to the line above). A
 * heading can only become a step again.
 */
export async function setLineKind(
	store: RecipeStore,
	recipeId: string,
	part: NotePart,
	index: number,
	kind: LineKind
): Promise<SetNoteResult> {
	const recipe = (await store.listRecipes()).find((r) => r.id === recipeId);
	if (!recipe) return 'not_found';
	const lines = recipe[part];
	if (!Number.isInteger(index) || index < 0 || index >= lines.length) return 'bad_index';
	if (isHeading(lines[index]) && kind !== 'step') return 'heading';
	if (kind === 'section' && index + 1 < lines.length && isNote(lines[index + 1])) {
		return 'has_tips';
	}

	const oldStamp = sourceHash(recipe);
	const changedLines = lines.map((line, i) => (i === index ? asKind(line, kind) : line));
	const updated = { ...recipe, [part]: changedLines };
	const newStamp = sourceHash(updated);
	await store.saveRecipe(updated);

	for (const language of LANGUAGES) {
		const override = await store.getOverride(recipe.id, language);
		if (!override || override.fields[part].length !== lines.length) continue;
		const translated = override.fields[part].map((line, i) =>
			i === index ? asKind(line, kind) : line
		);
		await store.setOverride(recipe.id, language, {
			hash: override.hash === oldStamp ? newStamp : override.hash,
			fields: { ...override.fields, [part]: translated }
		});
	}
	return 'changed';
}

/** Makes one ingredient or step a tip (asNote), or a step again. Kept for the tip button. */
export function setLineNote(
	store: RecipeStore,
	recipeId: string,
	part: NotePart,
	index: number,
	asNote: boolean
): Promise<SetNoteResult> {
	return setLineKind(store, recipeId, part, index, asNote ? 'tip' : 'step');
}
