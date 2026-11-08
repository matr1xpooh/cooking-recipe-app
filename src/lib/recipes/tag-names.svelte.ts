import { getLocale } from '#lib/paraglide/runtime.js';
import { SvelteSet } from 'svelte/reactivity';
import { isLanguage } from './languages';
import { isBuiltInTag, type Tag } from './recipe';
import { tagLabel } from './tags';
import { translateTags } from './translate-client';
import { translationCache } from './translation-cache';

/**
 * Names for tags in the site language. Built-in tags come from the translations;
 * typed tags are translated on demand and cached, so they match the rest of the site.
 */
export class TagNames {
	/** Translations of typed tags, by the tag as typed. */
	private names = $state<Record<string, string>>({});
	private locale = getLocale();
	private requested = new SvelteSet<string>();

	/** Translates any typed tags not yet translated. Safe to call with the same tags again. */
	async ensure(tags: Tag[]): Promise<void> {
		if (!isLanguage(this.locale)) return;
		const missing = tags.filter((t) => !isBuiltInTag(t) && !this.requested.has(t));
		if (missing.length === 0) return;
		missing.forEach((t) => this.requested.add(t));
		const translated = await translateTags(missing, this.locale, translationCache);
		this.names = { ...this.names, ...translated };
	}

	/** The name to show for a tag. */
	label(tag: Tag): string {
		if (isBuiltInTag(tag)) return tagLabel(tag);
		return this.names[tag] ?? tag;
	}
}
