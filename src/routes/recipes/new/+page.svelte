<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import RecipeForm from '#lib/recipes/RecipeForm.svelte';
	import { uploadImage } from '#lib/recipes/image-store.js';
	import { DuplicateRecipeError } from '#lib/recipes/recipe-api.js';
	import { createRecipe, type IngredientSource, type RecipeInput } from '#lib/recipes/recipe.js';

	let saveError = $state<string | null>(null);
	let duplicate = $state<{ id: string; title: string } | null>(null);

	// Load saved recipes first: saving writes the whole list back to storage.
	onMount(() => recipeStore.load());

	async function save(input: RecipeInput, source: IngredientSource, newImages: File[]) {
		const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
		try {
			// Images go up first, so a saved recipe never lists an image that is missing.
			const images: string[] = [];
			for (const file of newImages) images.push(await uploadImage(id, file));
			await recipeStore.add(createRecipe(input, { id, createdAt: new Date(), images, source }));
		} catch (error) {
			if (error instanceof DuplicateRecipeError) {
				duplicate = error.existing;
				return;
			}
			saveError = m.error_save_failed();
			return;
		}
		goto(resolve('/recipes'));
	}
</script>

<svelte:head>
	<title>{m.recipe_new_title()}</title>
</svelte:head>

<main>
	<h1>{m.recipe_new_title()}</h1>
	{#if saveError}
		<p role="alert">{saveError}</p>
	{/if}
	{#if duplicate}
		<p role="alert">
			{m.error_duplicate()}
			<a href={resolve('/recipes/[id]', { id: duplicate.id })}>{duplicate.title}</a>
		</p>
	{/if}
	<RecipeForm
		initial={{ title: '', sourceUrl: '', sourceStart: '', ingredients: '', steps: '', tags: [] }}
		submitLabel={m.recipe_save()}
		cancelHref={resolve('/recipes')}
		onsave={save}
	/>
</main>
