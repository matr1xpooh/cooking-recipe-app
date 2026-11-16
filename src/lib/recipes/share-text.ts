import { placeIngredients } from './ingredient-lines';
import { parseNotes } from './notes';
import type { RecipeFields } from './translation-fields';

/** The section names, already in the language the text is sent in. */
export interface ShareLabels {
	ingredients: string;
	steps: string;
	notes: string;
	source: string;
}

/** Free-text notes as plain text: bold, italic and colour are dropped, a link keeps its address. */
function plain(source: string): string {
	return parseNotes(source)
		.map((segment) => (segment.href ? `${segment.text} (${segment.href})` : segment.text))
		.join('');
}

/** A note line on an item, written under it with an arrow. */
function noteLines(notes: { note: { text: string } }[]): string[] {
	return notes.map((n) => `   ↳ ${plain(n.note.text)}`);
}

/**
 * The recipe as plain text for sharing: title, ingredients, steps (numbered across section
 * names, as on the page), notes and the source link. Empty parts are left out.
 */
export function recipeToText(
	fields: RecipeFields,
	labels: ShareLabels,
	sourceLink: string | null
): string {
	const sections: string[] = [];

	const ingredients: string[] = [];
	for (const group of placeIngredients(fields.ingredients)) {
		if (group.heading !== null) ingredients.push(`${group.heading.text}:`);
		for (const entry of group.items) {
			if (entry.item !== null) ingredients.push(`- ${entry.item.text}`);
			ingredients.push(...noteLines(entry.notes.map((n) => ({ note: n.note }))));
		}
	}
	if (ingredients.length > 0) sections.push([labels.ingredients, ...ingredients].join('\n'));

	const steps: string[] = [];
	let number = 0;
	for (const group of placeIngredients(fields.steps)) {
		if (group.heading !== null) steps.push(`${group.heading.text}:`);
		for (const entry of group.items) {
			if (entry.item !== null) steps.push(`${++number}. ${entry.item.text}`);
			steps.push(...noteLines(entry.notes.map((n) => ({ note: n.note }))));
		}
	}
	if (steps.length > 0) sections.push([labels.steps, ...steps].join('\n'));

	const notes = plain(fields.notes).trim();
	if (notes !== '') sections.push([labels.notes, notes].join('\n'));

	if (sourceLink) sections.push(`${labels.source}: ${sourceLink}`);

	const title = fields.title.trim();
	return [title, ...sections].filter((part) => part !== '').join('\n\n');
}
