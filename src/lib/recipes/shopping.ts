import { isHeading, isNote } from './ingredient-lines';
import { foldText } from './recipe';

/** Amounts of one item, by family: mass in grams, volume in millilitres, count as a number. */
export interface Amounts {
	mass?: number;
	volume?: number;
	count?: number;
}

export interface ParsedIngredient {
	/** The name as written, without the amount. */
	name: string;
	/** Same for the same ingredient: the folded name, plus a percentage when there is one. */
	key: string;
	amounts: Amounts;
	/** No amount at all ("to taste", "salt"): listed under "as needed", not added up. */
	toTaste: boolean;
}

/** Where the chosen recipes and the ticks are kept in this browser, so the list opens offline. */
export const SHOPPING_STORAGE_KEY = 'shopping-list.v1';

type Family = 'mass' | 'volume' | 'count';

/** Unit words in the four site languages, without dots. Factor converts to the family's base. */
const UNITS: Record<string, { family: Family; factor: number }> = {
	// mass, to grams
	g: { family: 'mass', factor: 1 },
	gr: { family: 'mass', factor: 1 },
	gram: { family: 'mass', factor: 1 },
	grams: { family: 'mass', factor: 1 },
	gramo: { family: 'mass', factor: 1 },
	gramos: { family: 'mass', factor: 1 },
	г: { family: 'mass', factor: 1 },
	грамм: { family: 'mass', factor: 1 },
	грамма: { family: 'mass', factor: 1 },
	граммов: { family: 'mass', factor: 1 },
	kg: { family: 'mass', factor: 1000 },
	kilo: { family: 'mass', factor: 1000 },
	kilos: { family: 'mass', factor: 1000 },
	kilogram: { family: 'mass', factor: 1000 },
	kilograms: { family: 'mass', factor: 1000 },
	кг: { family: 'mass', factor: 1000 },
	килограмм: { family: 'mass', factor: 1000 },
	килограмма: { family: 'mass', factor: 1000 },
	oz: { family: 'mass', factor: 28.35 },
	lb: { family: 'mass', factor: 453.6 },
	lbs: { family: 'mass', factor: 453.6 },
	// volume, to millilitres
	ml: { family: 'volume', factor: 1 },
	мл: { family: 'volume', factor: 1 },
	mililitro: { family: 'volume', factor: 1 },
	mililitros: { family: 'volume', factor: 1 },
	l: { family: 'volume', factor: 1000 },
	л: { family: 'volume', factor: 1000 },
	litre: { family: 'volume', factor: 1000 },
	litres: { family: 'volume', factor: 1000 },
	liter: { family: 'volume', factor: 1000 },
	liters: { family: 'volume', factor: 1000 },
	litro: { family: 'volume', factor: 1000 },
	litros: { family: 'volume', factor: 1000 },
	литр: { family: 'volume', factor: 1000 },
	литра: { family: 'volume', factor: 1000 },
	литров: { family: 'volume', factor: 1000 },
	tsp: { family: 'volume', factor: 5 },
	teaspoon: { family: 'volume', factor: 5 },
	teaspoons: { family: 'volume', factor: 5 },
	'ч.л': { family: 'volume', factor: 5 },
	cucharadita: { family: 'volume', factor: 5 },
	cucharaditas: { family: 'volume', factor: 5 },
	culleradeta: { family: 'volume', factor: 5 },
	culleradetes: { family: 'volume', factor: 5 },
	tbsp: { family: 'volume', factor: 15 },
	tablespoon: { family: 'volume', factor: 15 },
	tablespoons: { family: 'volume', factor: 15 },
	'ст.л': { family: 'volume', factor: 15 },
	cucharada: { family: 'volume', factor: 15 },
	cucharadas: { family: 'volume', factor: 15 },
	cullerada: { family: 'volume', factor: 15 },
	cullerades: { family: 'volume', factor: 15 },
	cup: { family: 'volume', factor: 240 },
	cups: { family: 'volume', factor: 240 },
	стакан: { family: 'volume', factor: 240 },
	стакана: { family: 'volume', factor: 240 },
	стаканов: { family: 'volume', factor: 240 },
	taza: { family: 'volume', factor: 240 },
	tazas: { family: 'volume', factor: 240 },
	tassa: { family: 'volume', factor: 240 },
	tasses: { family: 'volume', factor: 240 },
	// count
	шт: { family: 'count', factor: 1 },
	pc: { family: 'count', factor: 1 },
	pcs: { family: 'count', factor: 1 },
	piece: { family: 'count', factor: 1 },
	pieces: { family: 'count', factor: 1 },
	unidad: { family: 'count', factor: 1 },
	unidades: { family: 'count', factor: 1 },
	unitat: { family: 'count', factor: 1 },
	unitats: { family: 'count', factor: 1 },
	clove: { family: 'count', factor: 1 },
	cloves: { family: 'count', factor: 1 },
	головка: { family: 'count', factor: 1 },
	головки: { family: 'count', factor: 1 },
	головок: { family: 'count', factor: 1 },
	зубчик: { family: 'count', factor: 1 },
	зубчика: { family: 'count', factor: 1 },
	зубчиков: { family: 'count', factor: 1 },
	пучок: { family: 'count', factor: 1 },
	пучка: { family: 'count', factor: 1 },
	пучков: { family: 'count', factor: 1 }
};

/** Words that say the amount is "as needed". */
const TO_TASTE = /по вкусу|to taste|al gusto|al gust|на вкус|щепот\S*|pinch\S*/i;

export const FRACTIONS: Record<string, number> = {
	'½': 0.5,
	'¼': 0.25,
	'¾': 0.75,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'⅛': 0.125
};

/** One number: "2", "1,5", "1/4", "½", or a range "500-600" (its upper end, so the buy is enough). */
function parseNumber(token: string): number | null {
	const fraction = FRACTIONS[token];
	if (fraction !== undefined) return fraction;
	// "1¾": a whole number with a fraction character attached
	const attached = /^(\d+)([½¼¾⅓⅔⅛])$/.exec(token);
	if (attached) return Number(attached[1]) + (FRACTIONS[attached[2] ?? ''] ?? 0);
	const range = /^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/.exec(token);
	if (range) return Number((range[2] ?? '').replace(',', '.'));
	const ratio = /^(\d+)\/(\d+)$/.exec(token);
	if (ratio) return Number(ratio[1]) / Number(ratio[2]);
	if (/^\d+(?:[.,]\d+)?$/.test(token)) return Number(token.replace(',', '.'));
	return null;
}

/** A percentage token: "33%" or "33" followed by a "%" token (handled by the caller). */
function percentOf(token: string): string | null {
	const m = /^(\d+(?:[.,]\d+)?)%$/.exec(token);
	return m ? (m[1] ?? '').replace(',', '.') : null;
}

/** Units are compared without their dots and in lower case: "шт." is "шт", "ст. л." is "ст.л". */
function unitOf(token: string | undefined): string {
	return (token ?? '').toLowerCase().replace(/\.+$/, '');
}

/**
 * Reads the name, amount, unit and percentage of one ingredient line. The line can be in any
 * site language and is written in many ways ("Творог 12 % 750 г", "1 1/2 cups flour", "Соль - по
 * вкусу"). Remarks in brackets are ignored. Text it cannot read is kept as the name, with no amount.
 */
export function parseIngredient(line: string): ParsedIngredient {
	const toTaste = TO_TASTE.test(line);
	const cleaned = line
		.replace(/\([^)]*\)/g, ' ')
		.replace(TO_TASTE, ' ')
		.replace(/ч\.\s*(?:л\.?|ложк\S*)(?=\s|$)/gi, 'ч.л.')
		.replace(/ст\.\s*(?:л\.?|ложк\S*)(?=\s|$)/gi, 'ст.л.')
		.replace(/\s+/g, ' ')
		.trim();
	// "Для соуса: 150 г тунца": words before a colon are a label, not the name
	const colon = cleaned.indexOf(':');
	const body = colon >= 0 ? cleaned.slice(colon + 1).trim() : cleaned;
	const tokens = body.split(' ').filter((t) => t.length > 0);

	let percent: string | null = null;
	let cut = tokens.length;
	let amount: number | null = null;
	let unit: string | null = null;
	let amountEnd = -1;

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i] ?? '';
		const pct = percentOf(token);
		if (pct !== null) {
			percent = percent ?? pct;
			if (cut === tokens.length) cut = i;
			continue;
		}
		if (tokens[i + 1] === '%' || tokens[i + 1]?.startsWith('%')) {
			percent = percent ?? token.replace(',', '.');
			if (cut === tokens.length) cut = i;
			i++;
			continue;
		}
		let value = parseNumber(token);
		if (value === null) continue;
		if (cut === tokens.length) cut = i;
		let j = i + 1;
		// "1 1/2 cups": a whole number, then a fraction
		const second = tokens[j] !== undefined ? parseNumber(tokens[j] ?? '') : null;
		if (/^\d+$/.test(token) && second !== null && /\//.test(tokens[j] ?? '')) {
			value += second;
			j++;
		}
		// "500 - 600 мл": a range written with spaces
		if ((tokens[j] === '-' || tokens[j] === '–') && parseNumber(tokens[j + 1] ?? '') !== null) {
			value = parseNumber(tokens[j + 1] ?? '') ?? value;
			j += 2;
		}
		const next = unitOf(tokens[j]);
		unit = UNITS[next] ? next : null;
		amountEnd = unit ? j : j - 1;
		amount = value;
		break;
	}

	// The name is the words before the first amount; if the line starts with the amount, the
	// words after its unit.
	let nameTokens: string[];
	if (cut > 0) {
		nameTokens = tokens.slice(0, cut);
	} else if (amountEnd >= 0) {
		nameTokens = tokens.slice(amountEnd + 1);
	} else {
		nameTokens = tokens;
	}
	const name = nameTokens
		.join(' ')
		.replace(/^[\s\-–—,;:]+/, '')
		.replace(/[\s\-–—,;:]+$/, '')
		.trim();

	const amounts: Amounts = {};
	// "to taste" and pinches are not added up, even when a number is written with them
	if (amount !== null && !toTaste) {
		const spec = unit ? UNITS[unit] : undefined;
		if (spec) amounts[spec.family] = amount * spec.factor;
		else amounts.count = amount;
	}

	return {
		name,
		key: percent === null ? foldText(name) : `${foldText(name)} ${percent}`,
		amounts,
		toTaste: toTaste || amount === null
	};
}

export interface ShoppingFrom {
	recipeId: string;
	title: string;
	line: string;
}

export interface ShoppingItem {
	key: string;
	name: string;
	amounts: Amounts;
	/** True when no line of this ingredient has an amount. */
	toTaste: boolean;
	from: ShoppingFrom[];
}

/**
 * Adds the ingredients of the chosen recipes into one list. Section names and notes are skipped.
 * The same ingredient in several recipes is added up per family; families that cannot be added
 * (grams and millilitres) stay side by side on the same item.
 */
export function buildShoppingList(
	recipes: { id: string; title: string; lines: string[] }[]
): ShoppingItem[] {
	const items = new Map<string, ShoppingItem>();
	for (const recipe of recipes) {
		for (const line of recipe.lines) {
			if (isHeading(line) || isNote(line) || line.trim() === '') continue;
			const parsed = parseIngredient(line);
			if (parsed.name === '') continue;
			let item = items.get(parsed.key);
			if (!item) {
				item = { key: parsed.key, name: parsed.name, amounts: {}, toTaste: true, from: [] };
				items.set(parsed.key, item);
			}
			for (const family of ['mass', 'volume', 'count'] as const) {
				const value = parsed.amounts[family];
				if (value !== undefined) item.amounts[family] = (item.amounts[family] ?? 0) + value;
			}
			if (!parsed.toTaste) item.toTaste = false;
			item.from.push({ recipeId: recipe.id, title: recipe.title, line });
		}
	}
	return [...items.values()]
		.map((item) => ({ ...item, toTaste: item.toTaste || Object.keys(item.amounts).length === 0 }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export interface AmountUnits {
	g: string;
	kg: string;
	ml: string;
	l: string;
	pcs: string;
}

/** A number with at most two decimals and no trailing zeros. */
function fmt(n: number): string {
	return String(Math.round(n * 100) / 100);
}

/** "350 g", "1.25 kg", "240 ml + 100 g": grams from 1000 g, millilitres from 1000 ml. */
export function formatAmounts(amounts: Amounts, units: AmountUnits): string {
	const parts: string[] = [];
	if (amounts.mass !== undefined) {
		parts.push(
			amounts.mass >= 1000
				? `${fmt(amounts.mass / 1000)} ${units.kg}`
				: `${fmt(amounts.mass)} ${units.g}`
		);
	}
	if (amounts.volume !== undefined) {
		parts.push(
			amounts.volume >= 1000
				? `${fmt(amounts.volume / 1000)} ${units.l}`
				: `${fmt(amounts.volume)} ${units.ml}`
		);
	}
	if (amounts.count !== undefined) parts.push(`${fmt(amounts.count)} ${units.pcs}`);
	return parts.join(' + ');
}

/**
 * The list as plain text for sharing: each item that is not ticked as "have", with its total.
 * Items that have no amount are written under the "as needed" heading.
 */
export function shoppingToText(
	items: ShoppingItem[],
	have: string[],
	units: AmountUnits,
	labels: { asNeeded: string }
): string {
	const open = items.filter((item) => !have.includes(item.key));
	const buy = open.filter((item) => Object.keys(item.amounts).length > 0);
	const needed = open.filter((item) => Object.keys(item.amounts).length === 0);
	const lines = buy.map((item) => `- ${item.name}: ${formatAmounts(item.amounts, units)}`);
	if (needed.length > 0) {
		lines.push('', labels.asNeeded, ...needed.map((item) => `- ${item.name}`));
	}
	return lines.join('\n');
}
