import type { Recipe } from './recipe';
import type { TranslateItem } from './translation-types';

/** The parts of a recipe that get translated. Title and ingredients are plain text; steps and notes are styled. */
export interface RecipeFields {
	title: string;
	ingredients: string[];
	steps: string[];
	notes: string;
}

export function fieldsOf(recipe: Recipe): RecipeFields {
	return {
		title: recipe.title,
		ingredients: recipe.ingredients,
		steps: recipe.steps,
		notes: recipe.notes
	};
}

/** Flattens fields into the request order: title, ingredients, steps, notes. */
export function toItems(fields: RecipeFields): TranslateItem[] {
	return [
		{ text: fields.title, styled: false },
		...fields.ingredients.map((text) => ({ text, styled: false })),
		...fields.steps.map((text) => ({ text, styled: true })),
		{ text: fields.notes, styled: true }
	];
}

/** Rebuilds fields from translated texts in the same order as toItems. */
export function fromTexts(shape: RecipeFields, texts: string[]): RecipeFields {
	let i = 0;
	const next = () => texts[i++] ?? '';
	const title = next();
	const ingredients = shape.ingredients.map(() => next());
	const steps = shape.steps.map(() => next());
	const notes = next();
	return { title, ingredients, steps, notes };
}

/** Stable 32-bit FNV-1a hash of the items, so a cache entry is invalidated when the text changes. */
export function hashItems(items: TranslateItem[]): string {
	const text = JSON.stringify(items);
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}
