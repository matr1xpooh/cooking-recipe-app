import type { KeyValueStorage } from './store.svelte';

export const TRANSLATION_CACHE_KEY = 'recipe-translations.v1';

/** Oldest entries are dropped beyond this, so the cache can't grow without bound. */
export const MAX_CACHE_ENTRIES = 200;

interface CacheEntry {
	/** Hash of the source items the translation was made from. */
	hash: string;
	texts: string[];
}

type CacheMap = Record<string, CacheEntry>;

function readMap(storage: KeyValueStorage): CacheMap {
	const raw = storage.getItem(TRANSLATION_CACHE_KEY);
	if (raw === null) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
		const map: CacheMap = {};
		for (const [key, value] of Object.entries(parsed)) {
			const entry = value as Partial<CacheEntry> | null;
			if (
				entry &&
				typeof entry.hash === 'string' &&
				Array.isArray(entry.texts) &&
				entry.texts.every((t) => typeof t === 'string')
			) {
				map[key] = { hash: entry.hash, texts: entry.texts };
			}
		}
		return map;
	} catch {
		return {};
	}
}

/**
 * Translations of a recipe into one language, keyed by recipe, language and
 * kind. An entry is only returned when its hash matches the current text, so
 * editing a recipe makes its old translations miss.
 */
export class TranslationCache {
	private storage: KeyValueStorage | null;

	constructor(storage: KeyValueStorage | null) {
		this.storage = storage;
	}

	get(key: string, hash: string): string[] | null {
		if (!this.storage) return null;
		const entry = readMap(this.storage)[key];
		return entry && entry.hash === hash ? entry.texts : null;
	}

	set(key: string, hash: string, texts: string[]): void {
		if (!this.storage) return;
		const map = readMap(this.storage);
		delete map[key];
		map[key] = { hash, texts };
		const keys = Object.keys(map);
		for (const old of keys.slice(0, Math.max(0, keys.length - MAX_CACHE_ENTRIES))) {
			delete map[old];
		}
		this.storage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(map));
	}
}

/** Cache key for one recipe's translations into one language. */
export function cacheKey(
	recipeId: string,
	language: string,
	kind: 'detail' | 'title' | 'tag'
): string {
	return `${recipeId}|${language}|${kind}`;
}

export const translationCache = new TranslationCache(
	typeof localStorage === 'undefined' ? null : localStorage
);
