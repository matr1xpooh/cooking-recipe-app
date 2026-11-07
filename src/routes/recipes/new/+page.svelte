<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import RecipeForm from '#lib/recipes/RecipeForm.svelte';
	import { saveImage } from '#lib/recipes/image-store.js';
	import { createRecipe, type RecipeInput } from '#lib/recipes/recipe.js';

	let saveError = $state<string | null>(null);

	// Load saved recipes first: saving writes the whole list back to storage.
	onMount(() => recipeStore.load());

	async function save(input: RecipeInput, image: File | null) {
		const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
		try {
			// Store the screenshot first, so a saved recipe never points at a missing image.
			if (image) await saveImage(id, image);
		} catch {
			saveError = m.error_image_save_failed();
			return;
		}
		recipeStore.add(createRecipe(input, { id, createdAt: new Date(), hasImage: image !== null }));
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
		initial={{ title: '', sourceUrl: '', ingredients: '', steps: '' }}
		submitLabel={m.recipe_save()}
		cancelHref={resolve('/recipes')}
		onsave={save}
	/>
</main>
