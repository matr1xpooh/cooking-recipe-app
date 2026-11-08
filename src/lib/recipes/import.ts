/** Error keys returned by the import endpoint. Mapped to messages in the UI. */
export type ImportErrorKey =
	| 'url_invalid'
	| 'url_not_allowed'
	| 'page_unreachable'
	| 'page_too_large'
	| 'no_recipe_found'
	| 'description_not_parsed';

export interface ImportedRecipe {
	title: string;
	ingredients: string[];
	steps: string[];
}

type Obj = Record<string, unknown>;

const LD_JSON_SCRIPT = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function isObj(value: unknown): value is Obj {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecipeNode(node: Obj): boolean {
	const type = node['@type'];
	return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
}

/** Finds the first schema.org Recipe node, looking through arrays and @graph. */
function findRecipe(data: unknown): Obj | null {
	if (Array.isArray(data)) {
		for (const item of data) {
			const found = findRecipe(item);
			if (found) return found;
		}
		return null;
	}
	if (!isObj(data)) return null;
	if (isRecipeNode(data)) return data;
	if ('@graph' in data) return findRecipe(data['@graph']);
	return null;
}

function stringList(value: unknown): string[] {
	const items = Array.isArray(value) ? value : [value];
	return items
		.filter((item): item is string => typeof item === 'string')
		.map(cleanText)
		.filter((text) => text.length > 0);
}

/** Flattens recipeInstructions: plain strings, HowToStep, and HowToSection (with nested steps). */
function instructions(value: unknown): string[] {
	if (typeof value === 'string') {
		return value
			.split('\n')
			.map(cleanText)
			.filter((text) => text.length > 0);
	}
	if (Array.isArray(value)) return value.flatMap(instructions);
	if (!isObj(value)) return [];
	if (Array.isArray(value.itemListElement)) return instructions(value.itemListElement);
	const text = typeof value.text === 'string' ? value.text : value.name;
	return typeof text === 'string' && cleanText(text) ? [cleanText(text)] : [];
}

/** Removes HTML tags and collapses whitespace. */
function cleanText(text: string): string {
	return text
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Extracts a recipe from a page's schema.org JSON-LD data.
 * Returns null when the page has no usable recipe.
 */
export function extractRecipe(html: string): ImportedRecipe | null {
	for (const match of html.matchAll(LD_JSON_SCRIPT)) {
		let data: unknown;
		try {
			// Raw tabs and newlines inside JSON strings are invalid JSON, and many sites emit them.
			data = JSON.parse(match[1].replace(/[\u0000-\u001f]/g, ' '));
		} catch {
			continue;
		}
		const node = findRecipe(data);
		if (!node) continue;

		const recipe: ImportedRecipe = {
			title: typeof node.name === 'string' ? cleanText(node.name) : '',
			ingredients: stringList(node.recipeIngredient),
			steps: instructions(node.recipeInstructions)
		};
		if (recipe.ingredients.length > 0 || recipe.steps.length > 0) return recipe;
	}
	return null;
}

/** The page's og:title or <title>, used as a fallback title. YouTube's " - YouTube" suffix is dropped. */
export function pageTitle(html: string): string {
	const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
	const title = og?.[1] ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
	return cleanText(title).replace(/\s+-\s+YouTube$/, '');
}

export function isYouTubeUrl(url: URL): boolean {
	const host = url.hostname.toLowerCase();
	return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
}

/**
 * The video description from a YouTube watch page. The page embeds it as a
 * JSON string under "shortDescription".
 */
export function extractYouTubeDescription(html: string): string | null {
	const match = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
	if (!match) return null;
	try {
		return JSON.parse(`"${match[1]}"`) as string;
	} catch {
		return null;
	}
}

// Section headings in the languages the app supports. The lookahead, not \b,
// ends a heading because \b doesn't treat Cyrillic letters as word characters.
const INGREDIENTS_HEADING =
	/^(ingredients?|ingredientes?|ingredients|ингредиенты|ингредиент)(?=[\s:.!(]|$)/i;
const STEPS_HEADING =
	/^(steps?|method|instructions|directions|preparation|how to make|cooking|pasos|preparaci[oó]n|instrucciones|passos|preparaci[oó]|elaboraci[oó]n|elaboraci[oó]|procediment|instruccions|приготовление|шаги|пошагово|способ приготовления|рецепт)(?=[\s:.!(]|$)/i;
const CLOSING_LINE =
	/^(приятного аппетита|enjoy|buen provecho|bon profit|bon appetit|bon appétit|bon apetit)/i;
const TOTAL_LINE = /^(итого|итог|total)(?=[\s:.!(]|$)/i;

/** Drops price notes such as "(30 р.)" or "(«Ашан», 1 кг = 53 р.)" from an ingredient line. */
function stripPrices(line: string): string {
	return line.replace(/\s*\([^()]*\d[^()]*(?:р\.|₽|€|\$|£|=)[^()]*\)/g, '').trim();
}

function cleanDescriptionLine(line: string): string {
	return line.replace(/^\d+[.)]\s+/, '').trim();
}

/**
 * Splits a free-text video description into ingredients and steps using section
 * headings. Returns null when no heading is found. Subheadings ("Соус:") and totals
 * are dropped. Descriptions without clear headings won't parse.
 */
export function parseDescription(text: string): { ingredients: string[]; steps: string[] } | null {
	const lines = text.split(/\r?\n/).map((line) => line.trim());

	const ingredientsAt = lines.findIndex((line) => INGREDIENTS_HEADING.test(line));
	const stepsAt = lines.findIndex((line, i) => i > ingredientsAt && STEPS_HEADING.test(line));
	if (ingredientsAt < 0 && stepsAt < 0) return null;

	const ingredientLines =
		ingredientsAt < 0 ? [] : lines.slice(ingredientsAt + 1, stepsAt < 0 ? undefined : stepsAt);

	let stepLines: string[] = [];
	if (stepsAt >= 0) {
		const rest = lines.slice(stepsAt + 1);
		const closing = rest.findIndex((line) => CLOSING_LINE.test(line));
		stepLines = closing < 0 ? rest : rest.slice(0, closing);
	}

	const clean = (items: string[], transform: (s: string) => string) =>
		items
			.map((line) => transform(cleanDescriptionLine(line)))
			.filter((line) => line.length > 0 && !line.endsWith(':') && !TOTAL_LINE.test(line));

	const ingredients = clean(ingredientLines, stripPrices);
	const steps = clean(stepLines, (line) => line);
	if (ingredients.length === 0 && steps.length === 0) return null;
	return { ingredients, steps };
}
