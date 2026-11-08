<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import { isLanguage } from '#lib/recipes/languages.js';
	import { translateTitles } from '#lib/recipes/translate-client.js';
	import { translationCache } from '#lib/recipes/translation-cache.js';

	onMount(() => recipeStore.load());

	// The site language is set by a page reload, so it is read once per page view.
	const locale = getLocale();
	let titles = $state<Record<string, string>>({});

	// Translate every title in one batch; titles that fail show the original.
	$effect(() => {
		const list = recipeStore.recipes;
		if (list.length === 0 || !isLanguage(locale)) return;
		translateTitles(list, locale, translationCache).then((map) => {
			titles = map;
		});
	});
</script>

<svelte:head>
	<title>{m.recipes_title()}</title>
</svelte:head>

<main>
	<header>
		<h1>{m.recipes_title()}</h1>
		<a href={resolve('/recipes/new')}>{m.recipes_add()}</a>
	</header>

	{#if recipeStore.loadError}
		<p role="alert">{m.error_load_failed()}</p>
	{/if}

	{#if recipeStore.recipes.length === 0}
		<p>{m.recipes_empty()}</p>
	{:else}
		<ul>
			{#each recipeStore.recipes as recipe (recipe.id)}
				<li>
					<a class="card-link" href={resolve('/recipes/[id]', { id: recipe.id })}>
						<strong>{titles[recipe.id] ?? recipe.title}</strong>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
