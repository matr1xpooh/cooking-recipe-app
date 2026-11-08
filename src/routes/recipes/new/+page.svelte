<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import RecipeForm from '#lib/recipes/RecipeForm.svelte';
	import { saveImage } from '#lib/recipes/image-store.js';
	import { createRecipe, type IngredientSource, type RecipeInput } from '#lib/recipes/recipe.js';

	let saveError = $state<string | null>(null);

	onMount(() => recipeStore.load());

	async function save(input: RecipeInput, source: IngredientSource, image: File | null) {
		const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
		try {
			// The screenshot goes first, so a saved recipe never points at a missing image.
			if (image) await saveImage(id, image);
			await recipeStore.add(
				createRecipe(input, { id, createdAt: new Date(), hasImage: image !== null, source })
			);
		} catch {
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
	<RecipeForm
		initial={{ title: '', sourceUrl: '', ingredients: '', steps: '', tags: [] }}
		submitLabel={m.recipe_save()}
		cancelHref={resolve('/recipes')}
		onsave={save}
	/>
</main>
