import { setLocale } from '#lib/paraglide/runtime.js';
import { isLanguage } from '#lib/recipes/languages.js';

/**
 * Bumped on every language change made in this browser. The layout re-renders its
 * content when it changes, so every message and page picks up the new language.
 * Client-only: the server never changes it, so it is safe to keep at module level.
 */
export const localeChange = $state({ version: 0 });

/**
 * Switches the site language without reloading the page. The language cookie is set
 * (so the next visit and the server use it too) and the page re-renders in place.
 */
export function switchLocale(code: string): void {
	if (!isLanguage(code)) return;
	setLocale(code, { reload: false });
	document.documentElement.lang = code;
	localeChange.version++;
}
