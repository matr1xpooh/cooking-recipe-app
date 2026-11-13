<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Path } from '$app/types';
	import { page } from '$app/state';
	import { getLocale, locales } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';
	import { LANGUAGE_NAMES } from '#lib/recipes/languages.js';
	import { switchLocale } from '#lib/locale-change.svelte.js';

	const current = getLocale();

	/** Switches the site language in place. The link still works without JavaScript. */
	function choose(event: MouseEvent, code: string) {
		event.preventDefault();
		switchLocale(code);
	}
</script>

<nav class="language-links" aria-label={m.site_language_label()}>
	{#each locales as code (code)}
		{#if code === current}
			<span class="lang" aria-current="true" title={LANGUAGE_NAMES[code]}>{code.toUpperCase()}</span
			>
		{:else}
			<!-- The language is chosen by a cookie on the same page, so the link keeps the current path. -->
			<a
				class="lang"
				href={resolve(`${page.url.pathname}${page.url.search}` as Path)}
				hreflang={code}
				title={LANGUAGE_NAMES[code]}
				onclick={(event) => choose(event, code)}>{code.toUpperCase()}</a
			>
		{/if}
	{/each}
</nav>
