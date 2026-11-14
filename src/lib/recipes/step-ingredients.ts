import { headingText, isHeading, isNote } from './ingredient-lines.js';

/**
 * An ingredient used in a step: its position in the ingredient list, and whether the step says
 * "the rest of" it. The position lets the caller show the line in any language.
 */
export interface StepIngredient {
	index: number;
	remaining: boolean;
}

/**
 * The ingredient's name: the words before the first amount. "Творог 12 % 750 г" gives "Творог",
 * "Яйца 4 шт." gives "Яйца".
 */
export function ingredientName(line: string): string {
	const name: string[] = [];
	for (const word of line.trim().split(/\s+/)) {
		if (/\d/.test(word)) break;
		name.push(word);
	}
	return name.join(' ');
}

function normalize(text: string): string {
	return text.toLowerCase().replace(/ё/g, 'е');
}

/** The words of a text, without punctuation or digits. */
function words(text: string): string[] {
	return normalize(text)
		.split(/[^\p{L}]+/u)
		.filter((w) => w.length > 0);
}

/** The words and numbers of a step, with punctuation removed. */
function tokens(text: string): string[] {
	return normalize(text)
		.split(/[\s,.;:!?()«»"“”]+/u)
		.filter((t) => t.length > 0);
}

/**
 * Parts of a name that are looked for in a step. Only the first four letters of each word are
 * kept, so endings and related forms match: "масло" and "масла", "желток" and "желтки".
 * Words of three letters or fewer are kept whole. Short words such as "и" are skipped.
 */
function stems(name: string): string[] {
	return words(name)
		.filter((w) => w.length >= 3)
		.map((w) => (w.length >= 4 ? w.slice(0, 4) : w));
}

/**
 * Phrases that mean "the rest of it". Each language is checked, because the steps are matched in
 * the language the recipe was written in, which is not always the interface language.
 */
const REMAINING: RegExp[] = [
	/\bremaining\b|\bthe rest\b|\brest of\b/i,
	/\brestante|\bel resto\b|\bsobrante|\blo que queda\b/i,
	/\brestant\b|\bel resta\b|\bla resta\b/i,
	/остав(ш|лось|ше)|остат(ок|ки|ков)/i
];

/** True when a step refers to what is left of an ingredient from an earlier step. */
export function mentionsRemaining(step: string): boolean {
	return REMAINING.some((pattern) => pattern.test(step));
}

/** Indexes of the tokens that name one of the stems. */
function nameHits(toks: string[], parts: string[]): number[] {
	const hits: number[] = [];
	toks.forEach((token, i) => {
		const letters = token.replace(/[^\p{L}]/gu, '');
		if (parts.some((stem) => letters.startsWith(stem))) hits.push(i);
	});
	return hits;
}

/** True when a number is written next to the ingredient, such as "200 г сахара" or "2 eggplants". */
function amountNear(toks: string[], index: number): boolean {
	for (let i = Math.max(0, index - 3); i <= Math.min(toks.length - 1, index + 3); i++) {
		if (i !== index && /\d/.test(toks[i] ?? '')) return true;
	}
	return false;
}

/**
 * The ingredients each step uses, in list order, as positions in the ingredient list. Headings and
 * notes are skipped.
 *
 * An ingredient under a heading (such as "# Вторая заправка", the second dressing) is only used by a
 * step that mentions the heading. Other ingredients are used by any step that names them.
 *
 * An ingredient is shown at the first step that names it. A later step names it again as the same
 * item, so it is not shown again. It is shown again only when the step says "remaining" or gives a
 * new amount next to the name. The same name under the same heading counts as one ingredient.
 */
export function ingredientsPerStep(steps: string[], ingredientLines: string[]): StepIngredient[][] {
	// Each ingredient line with the heading it sits under, if any.
	const entries: { index: number; heading: string | null; line: string }[] = [];
	let heading: string | null = null;
	ingredientLines.forEach((line, index) => {
		if (isHeading(line)) {
			heading = normalize(headingText(line));
			return;
		}
		if (isNote(line)) return;
		entries.push({ index, heading, line });
	});

	const seen = new Set<string>();
	return steps.map((step) => {
		const toks = tokens(step);
		const remaining = mentionsRemaining(step);
		const used: StepIngredient[] = [];
		for (const entry of entries) {
			const parts = stems(ingredientName(entry.line));
			if (parts.length === 0) continue;
			if (entry.heading !== null && nameHits(toks, stems(entry.heading)).length === 0) continue;
			const hits = nameHits(toks, parts);
			if (hits.length === 0) continue;
			const key = `${entry.heading ?? ''}|${normalize(ingredientName(entry.line))}`;
			if (!seen.has(key)) {
				seen.add(key);
				used.push({ index: entry.index, remaining });
			} else if (remaining) {
				used.push({ index: entry.index, remaining: true });
			} else if (hits.some((i) => amountNear(toks, i))) {
				used.push({ index: entry.index, remaining: false });
			}
		}
		return used;
	});
}
