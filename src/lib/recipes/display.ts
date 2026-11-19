import type { Recipe } from './recipe.js';
import type { Language } from './languages.js';
import { restoreHeadings } from './ingredient-lines.js';
import { fetchGlossary, fetchOverride, type EditedTranslation } from './recipe-api.js';
import { applyGlossary, type GlossaryRule } from './glossary.js';
import { translateFields } from './translate-client.js';
import { translationCache } from './translation-cache.js';
import { fieldsOf, type RecipeFields } from './translation-fields.js';

/** The machine translation of a recipe, and whether any part of it fell back to the original. */
export interface Translated {
	fields: RecipeFields;
	failed: boolean;
}

/**
 * True when an edited translation has the same ingredient and step lines as the recipe. One that
 * does not fit (a line was added or removed in the original) is not shown or edited.
 */
export function editedFits(recipe: Recipe, override: EditedTranslation | null): boolean {
	return (
		override !== null &&
		override.fields.ingredients.length === recipe.ingredients.length &&
		override.fields.steps.length === recipe.steps.length
	);
}

/**
 * The text to show in the site language: the hand-edited translation if it fits the recipe, else
 * the machine translation, else the original. A translation keeps the heading markers of the
 * original ingredient list.
 */
export function shownFields(
	recipe: Recipe,
	translated: Translated | null,
	override: EditedTranslation | null
): RecipeFields {
	const edited = editedFits(recipe, override) ? override?.fields : undefined;
	const source = edited ?? translated?.fields;
	if (!source) return fieldsOf(recipe);
	return {
		...source,
		ingredients: restoreHeadings(source.ingredients, recipe.ingredients),
		steps: restoreHeadings(source.steps, recipe.steps)
	};
}

/** The translation fixes, loaded once and kept until they change. An unreachable server gives none. */
let glossary: Promise<GlossaryRule[]> | null = null;

function loadGlossary(): Promise<GlossaryRule[]> {
	glossary ??= fetchGlossary().catch(() => []);
	return glossary;
}

/** Call after a fix is added or removed, so the next translation uses the change. */
export function forgetGlossary(): void {
	glossary = null;
}

/**
 * Loads the machine translation and the hand-edited translation of a recipe. Machine translation
 * is a signed-in feature; a visitor gets the original text. Translation fixes replace their words
 * in the ingredient lines before the text is translated.
 */
export async function loadDisplay(
	recipe: Recipe,
	locale: Language,
	signedIn: boolean
): Promise<{ translated: Translated | null; override: EditedTranslation | null }> {
	const [translated, override] = await Promise.all([
		signedIn
			? loadGlossary().then((rules) => {
					const shape = fieldsOf(recipe);
					const ingredients = applyGlossary(shape.ingredients, rules, locale);
					return translateFields(
						{ ...shape, ingredients },
						recipe.id,
						locale,
						translationCache
					).then(
						// A failed translation falls back to the original text, not the text with fixes applied.
						(result) => (result.failed ? { fields: shape, failed: true } : result)
					);
				})
			: Promise.resolve(null),
		fetchOverride(recipe.id, locale).catch(() => null)
	]);
	return { translated, override };
}
