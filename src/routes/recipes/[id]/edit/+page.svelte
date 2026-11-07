<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import RecipeForm from '#lib/recipes/RecipeForm.svelte';
	import { applyEdit, type RecipeInput } from '#lib/recipes/recipe.js';

	let loaded = $state(false);

	onMount(() => {
		recipeStore.load();
		loaded = true;
	});

	const recipe = $derived(recipeStore.recipes.find((r) => r.id === page.params.id));

	function save(input: RecipeInput) {
		if (!recipe) return;
		recipeStore.update(applyEdit(recipe, input));
		goto(resolve('/recipes/[id]', { id: recipe.id }));
	}
</script>

<svelte:head>
	<title>{m.recipe_edit_title()}</title>
</svelte:head>

<main>
	{#if recipe}
		<h1>{m.recipe_edit_title()}</h1>
		<!-- Keyed by id so the form resets if the route changes to another recipe. -->
		{#key recipe.id}
			<RecipeForm
				initial={{
					title: recipe.title,
					sourceUrl: recipe.sourceUrl ?? '',
					ingredients: recipe.ingredients.join('\n'),
					steps: recipe.steps.join('\n')
				}}
				submitLabel={m.recipe_save()}
				cancelHref={resolve('/recipes/[id]', { id: recipe.id })}
				onsave={save}
			/>
		{/key}
	{:else if loaded}
		<h1>{m.recipe_not_found()}</h1>
	{/if}
</main>
