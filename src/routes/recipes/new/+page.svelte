<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import {
		createRecipe,
		hasErrors,
		validateRecipeInput,
		type RecipeErrorKey,
		type RecipeErrors,
		type RecipeInput
	} from '#lib/recipes/recipe.js';

	let input = $state<RecipeInput>({ title: '', sourceUrl: '', ingredients: '', steps: '' });
	let errors = $state<RecipeErrors>({});

	const errorMessages: Record<RecipeErrorKey, () => string> = {
		title_required: () => m.error_title_required(),
		source_url_invalid: () => m.error_source_url_invalid()
	};

	function submit(event: SubmitEvent) {
		event.preventDefault();
		errors = validateRecipeInput(input);
		if (hasErrors(errors)) return;

		recipeStore.add(
			createRecipe(input, {
				id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
				createdAt: new Date()
			})
		);
		goto(resolve('/recipes'));
	}
</script>

<svelte:head>
	<title>{m.recipe_new_title()}</title>
</svelte:head>

<main>
	<h1>{m.recipe_new_title()}</h1>

	<form onsubmit={submit} novalidate>
		<label>
			{m.recipe_field_title()}
			<input
				type="text"
				bind:value={input.title}
				aria-invalid={errors.title ? 'true' : undefined}
			/>
		</label>
		{#if errors.title}
			<p role="alert">{errorMessages[errors.title]()}</p>
		{/if}

		<label>
			{m.recipe_field_source_url()}
			<input
				type="url"
				bind:value={input.sourceUrl}
				aria-invalid={errors.sourceUrl ? 'true' : undefined}
			/>
		</label>
		{#if errors.sourceUrl}
			<p role="alert">{errorMessages[errors.sourceUrl]()}</p>
		{/if}

		<label>
			{m.recipe_field_ingredients()}
			<textarea rows="6" bind:value={input.ingredients}></textarea>
		</label>

		<label>
			{m.recipe_field_steps()}
			<textarea rows="8" bind:value={input.steps}></textarea>
		</label>

		<div>
			<button type="submit">{m.recipe_save()}</button>
			<a href={resolve('/recipes')}>{m.recipe_cancel()}</a>
		</div>
	</form>
</main>
