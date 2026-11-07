<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import RichText from '#lib/recipes/RichText.svelte';
	import { isLanguage } from '#lib/recipes/languages.js';
	import { translateFields } from '#lib/recipes/translate-client.js';
	import { translationCache } from '#lib/recipes/translation-cache.js';
	import { fieldsOf, type RecipeFields } from '#lib/recipes/translation-fields.js';

	let loaded = $state(false);
	let translated = $state<{ fields: RecipeFields; failed: boolean } | null>(null);
	let translating = $state(false);
	let showOriginal = $state(false);
	let latestRequest = 0;

	onMount(() => {
		recipeStore.load();
		loaded = true;
	});

	const recipe = $derived(recipeStore.recipes.find((r) => r.id === page.params.id));
	// The site language is set by a page reload, so it is read once per page view.
	const locale = getLocale();

	// Translate the recipe into the site language. Stale responses are ignored.
	$effect(() => {
		const current = recipe;
		if (!current || !isLanguage(locale)) return;
		const request = ++latestRequest;
		translating = true;
		translateFields(fieldsOf(current), current.id, locale, translationCache).then((result) => {
			if (request !== latestRequest) return;
			translated = result;
			translating = false;
		});
	});

	const shown = $derived<RecipeFields | null>(
		recipe ? (translated && !showOriginal ? translated.fields : fieldsOf(recipe)) : null
	);
</script>

<svelte:head>
	<title>{recipe?.title ?? m.recipes_title()}</title>
</svelte:head>

<main>
	<p class="back"><a href={resolve('/recipes')}>← {m.recipes_title()}</a></p>

	{#if recipe && shown}
		<article>
			<h1>{shown.title}</h1>
			{#if recipe.sourceUrl}
				<!-- External user-supplied URL: resolve() only applies to app routes. -->
				<p>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer"
						>{m.recipe_open_source()}</a
					>
				</p>
			{/if}

			{#if translating}
				<p class="meta">{m.translating()}</p>
			{:else if translated}
				<p class="translation-bar">
					{#if translated.failed}
						<span role="status">{m.translation_failed()}</span>
					{/if}
					<button type="button" onclick={() => (showOriginal = !showOriginal)}>
						{showOriginal ? m.show_translation() : m.show_original()}
					</button>
				</p>
			{/if}

			{#if shown.ingredients.length > 0}
				<section>
					<h2>{m.recipe_ingredients_heading()}</h2>
					<ul class="plain">
						{#each shown.ingredients as item, i (i)}
							<li>{item}</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if shown.steps.length > 0}
				<section>
					<h2>{m.recipe_steps_heading()}</h2>
					<ol>
						{#each shown.steps as step, i (i)}
							<li><RichText source={step} /></li>
						{/each}
					</ol>
				</section>
			{/if}

			{#if shown.notes}
				<section>
					<h2>{m.recipe_notes_heading()}</h2>
					<div class="notes-box">
						<RichText source={shown.notes} />
					</div>
				</section>
			{/if}
		</article>
	{:else if loaded}
		<h1>{m.recipe_not_found()}</h1>
	{/if}
</main>
