import type { Recipe } from './recipe';
import { HEADING_MARKER, headingText, isHeading } from './ingredient-lines';
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
		// The heading marker is not translated; fromTexts puts it back.
		...fields.ingredients.map((text) => ({ text: headingText(text), styled: false })),
		...fields.steps.map((text) => ({ text, styled: true })),
		{ text: fields.notes, styled: true }
	];
}

/** Rebuilds fields from translated texts in the same order as toItems. */
export function fromTexts(shape: RecipeFields, texts: string[]): RecipeFields {
	let i = 0;
	const next = () => texts[i++] ?? '';
	const title = next();
	const ingredients = shape.ingredients.map((line) =>
		isHeading(line) ? HEADING_MARKER + next() : next()
	);
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

/** Limits on an edited translation, to keep one save small. */
export const MAX_TRANSLATED_LINES = 200;
export const MAX_TRANSLATED_TEXT = 4000;

/** Checks a value has the shape of translated fields (see RecipeFields). */
export function isTranslatedFields(value: unknown): value is RecipeFields {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	const list = (x: unknown) =>
		Array.isArray(x) &&
		x.length <= MAX_TRANSLATED_LINES &&
		x.every((item) => typeof item === 'string' && item.length <= MAX_TRANSLATED_TEXT);
	return (
		typeof v.title === 'string' &&
		v.title.length <= MAX_TRANSLATED_TEXT &&
		list(v.ingredients) &&
		list(v.steps) &&
		typeof v.notes === 'string' &&
		v.notes.length <= MAX_TRANSLATED_TEXT
	);
}

/** A stable key for the source text: when it changes, an edited translation may be out of date. */
export function sourceHash(recipe: Recipe): string {
	return hashItems(toItems(fieldsOf(recipe)));
}
