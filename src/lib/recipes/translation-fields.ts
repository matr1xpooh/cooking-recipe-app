import type { Recipe } from './recipe';
import { HEADING_MARKER, headingText, isHeading, joinNote, splitNote } from './ingredient-lines';
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

/**
 * One translation item per line. Markers are not translated: a heading sends its words,
 * a note sends its text (styled, like steps), and fromTexts puts the markers back.
 */
function itemsOf(lines: string[], isIngredients: boolean): TranslateItem[] {
	return lines.map((line) => {
		if (isIngredients && isHeading(line)) return { text: headingText(line), styled: false };
		const note = splitNote(line);
		if (note) return { text: note.text, styled: true };
		return { text: line, styled: !isIngredients };
	});
}

/** Flattens fields into the request order: title, ingredients, steps, notes. */
export function toItems(fields: RecipeFields): TranslateItem[] {
	return [
		{ text: fields.title, styled: false },
		...itemsOf(fields.ingredients, true),
		...itemsOf(fields.steps, false),
		{ text: fields.notes, styled: true }
	];
}

/** Rebuilds fields from translated texts in the same order as toItems. */
export function fromTexts(shape: RecipeFields, texts: string[]): RecipeFields {
	let i = 0;
	const next = () => texts[i++] ?? '';
	const restore = (line: string, isIngredients: boolean): string => {
		if (isIngredients && isHeading(line)) return HEADING_MARKER + next();
		const note = splitNote(line);
		if (note) return joinNote({ bullet: note.bullet, text: next() });
		return next();
	};
	const title = next();
	const ingredients = shape.ingredients.map((line) => restore(line, true));
	const steps = shape.steps.map((line) => restore(line, false));
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
