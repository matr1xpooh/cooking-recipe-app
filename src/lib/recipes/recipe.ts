/** Where a recipe's ingredient list came from. The list stays editable whatever the source. */
export type IngredientSource = 'typed' | 'web' | 'image';

export const INGREDIENT_SOURCES: readonly IngredientSource[] = ['typed', 'web', 'image'];

export function isIngredientSource(value: unknown): value is IngredientSource {
	return typeof value === 'string' && (INGREDIENT_SOURCES as readonly string[]).includes(value);
}

/**
 * Built-in tags: the starting choices for the kind of food. Users can also type their
 * own; a tag typed on one recipe is shared with all of them.
 */
export const TAGS = [
	'meat',
	'poultry',
	'fish',
	'vegetarian',
	'soup',
	'dessert',
	'baking',
	'drinks'
] as const;
export type BuiltInTag = (typeof TAGS)[number];

export function isBuiltInTag(value: unknown): value is BuiltInTag {
	return typeof value === 'string' && (TAGS as readonly string[]).includes(value);
}

/** A tag is any short lowercase word or phrase, built-in or typed. */
export type Tag = string;

export const MAX_TAGS_PER_RECIPE = 10;
export const MAX_TAG_LENGTH = 30;

/** Cleans a typed tag: trimmed, lowercase, single spaces. Null when nothing usable is left. */
export function normalizeTag(raw: string): Tag | null {
	const tag = raw.trim().replace(/\s+/g, ' ').toLowerCase();
	if (tag.length === 0 || tag.length > MAX_TAG_LENGTH) return null;
	return tag;
}

/** Cleans a list of tags: each normalised, no duplicates, at most MAX_TAGS_PER_RECIPE. */
export function normalizeTags(values: readonly unknown[]): Tag[] {
	const result: Tag[] = [];
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const tag = normalizeTag(value);
		if (tag && !result.includes(tag)) result.push(tag);
		if (result.length === MAX_TAGS_PER_RECIPE) break;
	}
	return result;
}

export interface Recipe {
	id: string;
	title: string;
	/** External video or webpage URL, or null when none was given. */
	sourceUrl: string | null;
	/** Where the video starts, in seconds. Null when not given. Only meaningful with a video link. */
	sourceStart: number | null;
	ingredients: string[];
	/** One step per item. Steps may contain the styling markup (see notes.ts). */
	steps: string[];
	/**
	 * Notes from before the notes field was removed. Shown read-only on the detail
	 * page; new recipes always store an empty string.
	 */
	notes: string;
	/** True when an original screenshot is stored for this recipe (see image-store.ts). */
	hasImage: boolean;
	/** Where the ingredient list came from. */
	source: IngredientSource;
	/** Tags for the kind of food. Empty when none apply. */
	tags: Tag[];
	createdAt: string;
	archived: boolean;
}

/** Raw values as typed in the add-recipe form. Lists are one item per line. */
export interface RecipeInput {
	title: string;
	sourceUrl: string;
	/** Start time as typed: "83", "1:23" or "1:02:03". Blank when not given. */
	sourceStart: string;
	ingredients: string;
	steps: string;
	tags: Tag[];
}

export type RecipeField = 'title' | 'sourceUrl' | 'sourceStart';

export type RecipeErrors = Partial<Record<RecipeField, RecipeErrorKey>>;

export type RecipeErrorKey = 'title_required' | 'source_url_invalid' | 'start_invalid';

/** Splits multi-line form text into trimmed, non-empty items. */
export function parseLines(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

export function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

export function validateRecipeInput(input: RecipeInput): RecipeErrors {
	const errors: RecipeErrors = {};
	if (input.title.trim().length === 0) {
		errors.title = 'title_required';
	}
	const sourceUrl = input.sourceUrl.trim();
	if (sourceUrl.length > 0 && !isHttpUrl(sourceUrl)) {
		errors.sourceUrl = 'source_url_invalid';
	}
	if (input.sourceStart.trim().length > 0 && parseStart(input.sourceStart) === undefined) {
		errors.sourceStart = 'start_invalid';
	}
	return errors;
}

export function hasErrors(errors: RecipeErrors): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * Applies an edit to an existing recipe. Only the editable fields change; id,
 * creation date, legacy notes and archive state are kept. Callers should run
 * validateRecipeInput first.
 */
export function applyEdit(recipe: Recipe, input: RecipeInput, source: IngredientSource): Recipe {
	const sourceUrl = input.sourceUrl.trim();
	return {
		...recipe,
		source,
		tags: input.tags,
		title: input.title.trim(),
		sourceUrl: sourceUrl.length > 0 ? sourceUrl : null,
		sourceStart: sourceUrl.length > 0 ? (parseStart(input.sourceStart) ?? null) : null,
		ingredients: parseLines(input.ingredients),
		steps: parseLines(input.steps)
	};
}

/** Builds a Recipe from valid input. Callers should run validateRecipeInput first. */
export function createRecipe(
	input: RecipeInput,
	options: {
		id: string;
		createdAt: Date;
		hasImage?: boolean;
		source?: IngredientSource;
	}
): Recipe {
	const sourceUrl = input.sourceUrl.trim();
	return {
		id: options.id,
		title: input.title.trim(),
		sourceUrl: sourceUrl.length > 0 ? sourceUrl : null,
		sourceStart: sourceUrl.length > 0 ? (parseStart(input.sourceStart) ?? null) : null,
		ingredients: parseLines(input.ingredients),
		steps: parseLines(input.steps),
		notes: '',
		hasImage: options.hasImage ?? false,
		source: options.source ?? 'typed',
		tags: input.tags,
		createdAt: options.createdAt.toISOString(),
		archived: false
	};
}

/**
 * Adds incoming ingredient lines to the current ones, skipping any already present
 * (ignoring case and surrounding spaces). Current lines keep their order.
 */
export function mergeIngredientLines(current: string[], incoming: string[]): string[] {
	const seen = new Set(current.map((l) => l.trim().toLowerCase()));
	const result = current.map((l) => l.trim()).filter((l) => l.length > 0);
	for (const line of incoming) {
		const key = line.trim().toLowerCase();
		if (key.length === 0 || seen.has(key)) continue;
		seen.add(key);
		result.push(line.trim());
	}
	return result;
}

/**
 * A start time typed as "83", "1:23" or "1:02:03" in seconds. Blank gives null.
 * Undefined when the text is not a time.
 */
export function parseStart(text: string): number | null | undefined {
	const value = text.trim();
	if (value.length === 0) return null;
	if (/^\d+$/.test(value)) return Number(value);
	const parts = value.split(':');
	if (!parts.every((p) => /^\d{1,2}$/.test(p)) || parts.length < 2 || parts.length > 3)
		return undefined;
	const [h, m, sec] = parts.length === 3 ? parts.map(Number) : [0, ...parts.map(Number)];
	if (m > 59 || sec > 59) return undefined;
	return h * 3600 + m * 60 + sec;
}

/** Seconds as m:ss, or h:mm:ss past an hour. Blank for null. */
export function formatStart(seconds: number | null): string {
	if (seconds === null) return '';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const sec = seconds % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** The link to open for a recipe: the video, starting at the given time when there is one. */
export function sourceHref(url: string, start: number | null): string {
	if (start === null || start <= 0) return url;
	try {
		const u = new URL(url);
		if (!(u.hostname === 'youtu.be' || u.hostname.endsWith('youtube.com'))) return url;
		u.searchParams.set('t', `${start}s`);
		return u.toString();
	} catch {
		return url;
	}
}

/**
 * A key for comparing recipe addresses. The same video or page gives the same key
 * whether it is written as youtu.be or youtube.com, with or without www, a trailing
 * slash, a start time or tracking parameters.
 */
export function normalizeSourceUrl(raw: string): string {
	try {
		const url = new URL(raw.trim());
		const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
		if (host === 'youtu.be') return `youtube:${url.pathname.slice(1)}`;
		if (host.endsWith('youtube.com')) {
			const id = url.searchParams.get('v');
			if (id) return `youtube:${id}`;
		}
		const path = url.pathname.replace(/\/+$/, '') || '/';
		const kept = [...url.searchParams]
			.filter(([k]) => !k.startsWith('utm_'))
			.sort(([a], [b]) => a.localeCompare(b));
		const query = kept.length > 0 ? `?${new URLSearchParams(kept).toString()}` : '';
		return `${host}${path}${query}`;
	} catch {
		return raw.trim();
	}
}
