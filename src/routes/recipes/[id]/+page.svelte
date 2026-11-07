<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import RichNotes from '#lib/recipes/RichNotes.svelte';
	import { LANGUAGE_NAMES } from '#lib/recipes/languages.js';

	let loaded = $state(false);

	onMount(() => {
		recipeStore.load();
		loaded = true;
	});

	const recipe = $derived(recipeStore.recipes.find((r) => r.id === page.params.id));
</script>

<svelte:head>
	<title>{recipe?.title ?? m.recipes_title()}</title>
</svelte:head>

<main>
	<p class="back"><a href={resolve('/recipes')}>← {m.recipes_title()}</a></p>

	{#if recipe}
		<article>
			<h1>{recipe.title}</h1>
			{#if recipe.sourceUrl}
				<!-- External user-supplied URL: resolve() only applies to app routes. -->
				<p>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer"
						>{m.recipe_open_source()}</a
					>
				</p>
			{/if}

			{#if recipe.ingredients.length > 0}
				<section>
					<h2>{m.recipe_ingredients_heading()}</h2>
					<ul class="plain">
						{#each recipe.ingredients as item, i (i)}
							<li>{item}</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if recipe.steps.length > 0}
				<section>
					<h2>{m.recipe_steps_heading()}</h2>
					<ol>
						{#each recipe.steps as step, i (i)}
							<li>{step}</li>
						{/each}
					</ol>
				</section>
			{/if}

			{#if recipe.notes}
				<section>
					<h2>{m.recipe_notes_heading()}</h2>
					{#if recipe.language && recipe.notesTranslated !== null}
						<p class="meta">{LANGUAGE_NAMES[recipe.language]}</p>
						<RichNotes source={recipe.notesTranslated} />
						<details>
							<summary>{m.notes_show_original()}</summary>
							<RichNotes source={recipe.notes} />
						</details>
					{:else}
						<RichNotes source={recipe.notes} />
					{/if}
				</section>
			{/if}
		</article>
	{:else if loaded}
		<h1>{m.recipe_not_found()}</h1>
	{/if}
</main>
