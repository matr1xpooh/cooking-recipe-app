<script lang="ts">
	import { getLocale, locales, setLocale } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';
	import { LANGUAGE_NAMES, isLanguage } from '#lib/recipes/languages.js';

	/** Switches the whole site's language. Paraglide stores the choice and reloads the page. */
	function change(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (isLanguage(value)) setLocale(value, { reload: true });
	}
</script>

<select
	class="language-switch"
	value={getLocale()}
	onchange={change}
	aria-label={m.site_language_label()}
>
	{#each locales as code (code)}
		<option value={code}>{LANGUAGE_NAMES[code]}</option>
	{/each}
</select>
