import { isHeading, isNote } from './ingredient-lines';
import { FRACTIONS } from './shopping';

/*
 * Scaling an ingredient line: every amount in the line is multiplied by a factor and written
 * again the way it was written before ("1/2" stays a fraction, "1,5" keeps its comma). Text
 * around the amounts is untouched, so "harina 200 g" becomes "harina 180 g" at 0.9. Headings,
 * notes, brackets and percentages are left alone.
 */

const UNICODE_FRACTIONS = Object.keys(FRACTIONS).join('');

/** One amount, or a range of two: "2", "1,5", "1/2", "1 1/2", "½", "1¾", "500-600". */
const AMOUNT = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+[${UNICODE_FRACTIONS}]|[${UNICODE_FRACTIONS}]|\\d+(?:[.,]\\d+)?)`;
const AMOUNT_OR_RANGE = `${AMOUNT}(?:\\s*[-–]\\s*${AMOUNT})?`;

/** The amount's start must not follow a letter, digit, slash, dot or comma (so "B12" is not an amount). */
const FIND_AMOUNTS = `(?<![\\p{L}\\p{N}/.,])${AMOUNT_OR_RANGE}`;

const RANGE_SEPARATOR = /(\s*[-–]\s*)/;

/** How an amount was written, so the scaled one is written the same way. */
type Style = { kind: 'fraction'; unicode: boolean } | { kind: 'decimal'; comma: boolean };

interface Amount {
	value: number;
	style: Style;
}

interface Found {
	start: number;
	end: number;
	text: string;
}

const UNICODE_FOR: Record<string, string> = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/8': '⅛' };

/** Reads one amount (not a range). Null when the text is not an amount. */
function readAmount(text: string): Amount | null {
	const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
	if (mixed) {
		return {
			value: Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]),
			style: { kind: 'fraction', unicode: false }
		};
	}
	const ratio = /^(\d+)\/(\d+)$/.exec(text);
	if (ratio) {
		return {
			value: Number(ratio[1]) / Number(ratio[2]),
			style: { kind: 'fraction', unicode: false }
		};
	}
	const attached = new RegExp(`^(\\d+)([${UNICODE_FRACTIONS}])$`).exec(text);
	if (attached) {
		return {
			value: Number(attached[1]) + (FRACTIONS[attached[2] ?? ''] ?? 0),
			style: { kind: 'fraction', unicode: true }
		};
	}
	const symbol = FRACTIONS[text];
	if (symbol !== undefined) return { value: symbol, style: { kind: 'fraction', unicode: true } };
	if (/^\d+(?:[.,]\d+)?$/.test(text)) {
		return {
			value: Number(text.replace(',', '.')),
			style: { kind: 'decimal', comma: text.includes(',') }
		};
	}
	return null;
}

/** Every amount in a line that is not inside brackets and not a percentage. */
function findAmounts(line: string): Found[] {
	const found: Found[] = [];
	for (const m of line.matchAll(new RegExp(FIND_AMOUNTS, 'gu'))) {
		const start = m.index ?? 0;
		const text = m[0];
		const end = start + text.length;
		const before = line.slice(0, start);
		const openBrackets = (before.match(/\(/g) ?? []).length - (before.match(/\)/g) ?? []).length;
		if (openBrackets > 0) continue;
		if (/^\s*%/.test(line.slice(end))) continue;
		found.push({ start, end, text });
	}
	return found;
}

function formatFraction(value: number, unicode: boolean): string {
	// Whole eighths: the finest step cooks use. Never less than one eighth.
	const eighths = Math.max(1, Math.round(value * 8));
	const whole = Math.floor(eighths / 8);
	const rest = eighths % 8;
	if (rest === 0) return String(whole);
	const divisor = gcd(rest, 8);
	const key = `${rest / divisor}/${8 / divisor}`;
	const fraction = unicode && UNICODE_FOR[key] ? UNICODE_FOR[key] : key;
	return whole > 0 ? `${whole} ${fraction}` : fraction;
}

function formatDecimal(value: number, comma: boolean): string {
	const text = String(Math.max(Math.round(value * 100) / 100, 0.01));
	return comma ? text.replace('.', ',') : text;
}

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

function formatAmount(value: number, style: Style): string {
	return style.kind === 'fraction'
		? formatFraction(value, style.unicode)
		: formatDecimal(value, style.comma);
}

/** Scales one amount or range, keeping a range's dash as it was written. */
function scaleText(text: string, factor: number): string {
	return (
		text
			.split(RANGE_SEPARATOR)
			// The separator pieces ("-") are not amounts, so they come back unchanged.
			.map((part) => {
				const amount = readAmount(part);
				return amount ? formatAmount(amount.value * factor, amount.style) : part;
			})
			.join('')
	);
}

/** The line with every amount multiplied by the factor. Headings, notes and lines without amounts are returned as they are. */
export function scaleLine(line: string, factor: number): string {
	if (factor === 1 || isHeading(line) || isNote(line)) return line;
	let out = '';
	let last = 0;
	for (const found of findAmounts(line)) {
		out += line.slice(last, found.start) + scaleText(found.text, factor);
		last = found.end;
	}
	return out + line.slice(last);
}

/** True when the line has an amount the scale can change. Used to decide which quantities are tappable. */
export function hasAmount(line: string): boolean {
	return !isHeading(line) && !isNote(line) && findAmounts(line).length > 0;
}

/** The first amount of a line (the upper end of a range is not used: the first number is what the user sees). */
export function firstAmount(line: string): number | null {
	if (isHeading(line) || isNote(line)) return null;
	const first = findAmounts(line)[0];
	if (!first) return null;
	const part = first.text.split(RANGE_SEPARATOR)[0] ?? '';
	return readAmount(part.trim())?.value ?? null;
}

/**
 * The factor that makes the line's first amount equal to the value the user typed: 180 typed on
 * "200 g harina" gives 0.9. Null when the line has no amount or the value is not positive.
 */
export function factorFor(line: string, typed: number): number | null {
	const current = firstAmount(line);
	if (current === null || current <= 0 || !(typed > 0)) return null;
	return typed / current;
}
