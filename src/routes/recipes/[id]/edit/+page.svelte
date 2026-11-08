<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import RecipeForm from '#lib/recipes/RecipeForm.svelte';
	import { saveImage } from '#lib/recipes/image-store.js';
	import { applyEdit, type IngredientSource, type RecipeInput } from '#lib/recipes/recipe.js';

	let loaded = $state(false);
	let saveError = $state<string | null>(null);

	onMount(async () => {
		await recipeStore.load();
		loaded = true;
	});

	const recipe = $derived(recipeStore.recipes.find((r) => r.id === page.params.id));

	async function save(input: RecipeInput, source: IngredientSource, image: File | null) {
		if (!recipe) return;
		try {
			// A new screenshot replaces the saved one; otherwise the saved one is kept.
			if (image) await saveImage(recipe.id, image);
			await recipeStore.update({
				...applyEdit(recipe, input, source),
				hasImage: recipe.hasImage || image !== null
			});
		} catch {
			saveError = m.error_save_failed();
			return;
		}
		goto(resolve('/recipes/[id]', { id: recipe.id }));
	}
</script>

<svelte:head>
	<title>{m.recipe_edit_title()}</title>
</svelte:head>

<main>
	{#if recipe}
		<h1>{m.recipe_edit_title()}</h1>
		{#if saveError}
			<p role="alert">{saveError}</p>
		{/if}
		<!-- Keyed by id so the form resets if the route changes to another recipe. -->
		{#key recipe.id}
			<RecipeForm
				initial={{
					title: recipe.title,
					sourceUrl: recipe.sourceUrl ?? '',
					ingredients: recipe.ingredients.join('\n'),
					steps: recipe.steps.join('\n'),
					category: recipe.category
				}}
				initialSource={recipe.source}
				submitLabel={m.recipe_save()}
				cancelHref={resolve('/recipes/[id]', { id: recipe.id })}
				savedImageId={recipe.hasImage ? recipe.id : null}
				onsave={save}
			/>
		{/key}
	{:else if loaded}
		<h1>{m.recipe_not_found()}</h1>
	{/if}
</main>
