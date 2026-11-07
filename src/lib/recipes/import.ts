/** Error keys returned by the import endpoint. Mapped to messages in the UI. */
export type ImportErrorKey =
	'url_invalid' | 'url_not_allowed' | 'page_unreachable' | 'page_too_large' | 'no_recipe_found';

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
			data = JSON.parse(match[1]);
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

/** The page's og:title or <title>, used as a fallback title. */
export function pageTitle(html: string): string {
	const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
	const title = og?.[1] ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
	return cleanText(title);
}
