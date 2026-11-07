import type { Recipe } from './recipe';
import { cacheKey, type TranslationCache } from './translation-cache';
import { fromTexts, hashItems, toItems, type RecipeFields } from './translation-fields';
import type { TranslateItem, TranslatedItem } from './translation-types';

type FetchFn = typeof fetch;

/** Matches the server's per-request item limit. */
const BATCH_SIZE = 40;

async function postItems(
	items: TranslateItem[],
	target: string,
	fetchFn: FetchFn
): Promise<TranslatedItem[] | null> {
	try {
		const res = await fetchFn('/api/recipes/translate', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ target, items })
		});
		if (!res.ok) return null;
		const body = (await res.json()) as { items?: TranslatedItem[] };
		return Array.isArray(body.items) && body.items.length === items.length ? body.items : null;
	} catch {
		return null;
	}
}

/**
 * Translates a recipe's fields into `target`. Serves from the cache when the text
 * is unchanged. Only fully successful translations are cached, so a failed part is
 * retried on the next view. `failed` is true when any part fell back to the original.
 */
export async function translateFields(
	shape: RecipeFields,
	recipeId: string,
	target: string,
	cache: TranslationCache,
	fetchFn: FetchFn = fetch
): Promise<{ fields: RecipeFields; failed: boolean }> {
	const items = toItems(shape);
	const key = cacheKey(recipeId, target, 'detail');
	const hash = hashItems(items);

	const cached = cache.get(key, hash);
	if (cached) return { fields: fromTexts(shape, cached), failed: false };

	const translated = await postItems(items, target, fetchFn);
	if (!translated) return { fields: shape, failed: true };

	const failed = translated.some((t) => t.failed);
	const texts = translated.map((t) => t.text);
	if (!failed) cache.set(key, hash, texts);
	return { fields: fromTexts(shape, texts), failed };
}

/**
 * Translates recipe titles for the list, in batches. Returns the translated title
 * by recipe id. Titles that fail are left out, so the list shows the original.
 */
export async function translateTitles(
	recipes: Recipe[],
	target: string,
	cache: TranslationCache,
	fetchFn: FetchFn = fetch
): Promise<Record<string, string>> {
	const result: Record<string, string> = {};
	const pending: Recipe[] = [];

	for (const recipe of recipes) {
		const item = [{ text: recipe.title, styled: false }];
		const cached = cache.get(cacheKey(recipe.id, target, 'title'), hashItems(item));
		if (cached) result[recipe.id] = cached[0];
		else pending.push(recipe);
	}

	for (let start = 0; start < pending.length; start += BATCH_SIZE) {
		const batch = pending.slice(start, start + BATCH_SIZE);
		const items = batch.map((r) => ({ text: r.title, styled: false }));
		const translated = await postItems(items, target, fetchFn);
		if (!translated) continue;
		translated.forEach((t, i) => {
			if (t.failed) return;
			const recipe = batch[i];
			result[recipe.id] = t.text;
			cache.set(cacheKey(recipe.id, target, 'title'), hashItems([items[i]]), [t.text]);
		});
	}
	return result;
}
