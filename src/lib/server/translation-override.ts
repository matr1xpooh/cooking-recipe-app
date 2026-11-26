import type { RecipeFields } from '#lib/recipes/translation-fields.js';

/** A translation edited by hand. `hash` is the source text it was made from, so a later change to the recipe can be noticed. */
export interface TranslationOverride {
	hash: string;
	fields: RecipeFields;
}
