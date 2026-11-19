import type { Language } from './languages.js';

/**
 * Translation fixes. When a translated ingredient is corrected by hand, the app can remember the
 * word that was wrong. A fix replaces that word in the original text before the recipe is
 * translated, so the fix applies to every recipe in that language.
 */

/** How an ingredient is measured. A word such as "масло" means oil by volume and butter by weight. */
export type Measure = 'volume' | 'weight';

export interface GlossaryRule {
	id: string;
	language: Language;
	/** The Russian word as written in the recipe, lowercase. */
	source: string;
	/** The word to use in the translation. */
	target: string;
	/** When set, the fix applies only to lines measured this way. */
	unit?: Measure;
}

// Russian words end on a letter, so "(?!\p{L})" marks the end of a word here (\b does not work for Cyrillic).
const VOLUME =
	/(ч\.?\s*л(?!\p{L})|ст\.?\s*л(?!\p{L})|ложк|стакан|чашк|мл(?!\p{L})|\bml\b|\bcups?\b|\btsp\b|\btbsp\b|spoons?|\bl\b|литр)/iu;
const WEIGHT = /\d\s*(г|гр|кг)(?!\p{L})|\d\s*(g|kg|lb|oz)\b/iu;

/** The measure an ingredient line uses: a spoon, cup or volume, or a weight. Null when neither is named. */
export function measureOf(line: string): Measure | null {
	if (VOLUME.test(line)) return 'volume';
	if (WEIGHT.test(line)) return 'weight';
	return null;
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The ingredient lines with each fix for this language applied. A line that the fix's unit does not
 * match is left alone. Headings and notes are changed too, so the translation of them agrees.
 */
export function applyGlossary(
	lines: string[],
	rules: GlossaryRule[],
	language: Language
): string[] {
	const active = rules.filter((rule) => rule.language === language);
	if (active.length === 0) return lines;
	return lines.map((line) => {
		const measure = measureOf(line);
		let out = line;
		for (const rule of active) {
			if (rule.unit && rule.unit !== measure) continue;
			const word = new RegExp(`(?<!\\p{L})${escapeRegex(rule.source)}(?!\\p{L})`, 'giu');
			out = out.replace(word, () => rule.target);
		}
		return out;
	});
}

/** The first word of a text, with its letters only. Empty when there is none. */
function firstWord(text: string): string {
	return text.trim().match(/^\p{L}+/u)?.[0] ?? '';
}

/**
 * The fix a hand edit implies, or null when the edit does not change the first word (the name), or
 * the recipe's word is not Russian. Only "масло" gets a unit: oil when measured by volume, butter
 * when measured by weight. A "масло" line with no measure gives no fix, since the choice is unknown.
 */
export function fixFromEdit(
	original: string,
	shownBefore: string,
	edited: string
): { source: string; target: string; unit?: Measure } | null {
	const source = firstWord(original).toLowerCase();
	const target = firstWord(edited);
	if (!source || !target || !/\p{Script=Cyrillic}/u.test(source)) return null;
	if (firstWord(shownBefore).toLowerCase() === target.toLowerCase()) return null;
	if (source !== 'масло') return { source, target };
	const unit = measureOf(original);
	return unit ? { source, target, unit } : null;
}
