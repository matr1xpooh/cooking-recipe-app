<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';

	onMount(() => recipeStore.load());
</script>

<svelte:head>
	<title>{m.recipes_title()}</title>
</svelte:head>

<main>
	<header>
		<h1>{m.recipes_title()}</h1>
		<a href={resolve('/recipes/new')}>{m.recipes_add()}</a>
	</header>

	{#if recipeStore.recipes.length === 0}
		<p>{m.recipes_empty()}</p>
	{:else}
		<ul>
			{#each recipeStore.recipes as recipe (recipe.id)}
				<li>
					<strong>{recipe.title}</strong>
					{#if recipe.sourceUrl}
						<!-- External user-supplied URL: resolve() only applies to app routes. -->
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer"
							>{recipe.sourceUrl}</a
						>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>
