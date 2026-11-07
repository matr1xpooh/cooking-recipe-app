<script lang="ts">
	import { onMount, tick } from 'svelte';
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
	import type { ImportErrorKey } from '#lib/recipes/import.js';

	let input = $state<RecipeInput>({
		title: '',
		sourceUrl: '',
		ingredients: '',
		steps: ''
	});
	let errors = $state<RecipeErrors>({});
	let importing = $state(false);
	let importError = $state<ImportErrorKey | null>(null);
	let stepsField: HTMLTextAreaElement | undefined = $state();

	// Load saved recipes first: saving writes the whole list back to storage.
	onMount(() => recipeStore.load());

	const styleColors = [
		{ key: 'red', label: () => m.color_red() },
		{ key: 'orange', label: () => m.color_orange() },
		{ key: 'green', label: () => m.color_green() },
		{ key: 'blue', label: () => m.color_blue() },
		{ key: 'purple', label: () => m.color_purple() }
	] as const;

	const errorMessages: Record<RecipeErrorKey, () => string> = {
		title_required: () => m.error_title_required(),
		source_url_invalid: () => m.error_source_url_invalid()
	};

	const importErrorMessages: Record<ImportErrorKey, () => string> = {
		url_invalid: () => m.error_source_url_invalid(),
		url_not_allowed: () => m.import_error_url_not_allowed(),
		page_unreachable: () => m.import_error_page_unreachable(),
		page_too_large: () => m.import_error_page_too_large(),
		no_recipe_found: () => m.import_error_no_recipe_found(),
		description_not_parsed: () => m.import_error_description_not_parsed()
	};

	/** Fills empty fields from the source page's recipe data. Typed values are kept. */
	async function importFromUrl() {
		importError = null;
		const target = input.sourceUrl.trim();
		if (target.length === 0) {
			importError = 'url_invalid';
			return;
		}

		importing = true;
		try {
			const res = await fetch(`/api/recipes/import?url=${encodeURIComponent(target)}`);
			const body = await res.json();
			if (!res.ok) {
				importError = body.error ?? 'page_unreachable';
				return;
			}
			if (input.title.trim().length === 0) input.title = body.title;
			if (input.ingredients.trim().length === 0) input.ingredients = body.ingredients.join('\n');
			if (input.steps.trim().length === 0) input.steps = body.steps.join('\n');
		} catch {
			importError = 'page_unreachable';
		} finally {
			importing = false;
		}
	}

	/** Wraps the selected steps text in markup markers, keeping the selection. */
	async function wrapSteps(open: string, close: string) {
		const el = stepsField;
		if (!el) return;
		const { selectionStart: start, selectionEnd: end, value } = el;
		const selected = value.slice(start, end);
		input.steps = value.slice(0, start) + open + selected + close + value.slice(end);
		await tick();
		el.focus();
		el.setSelectionRange(start + open.length, start + open.length + selected.length);
	}

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

		<div>
			<button type="button" onclick={importFromUrl} disabled={importing}>
				{importing ? m.import_importing() : m.import_button()}
			</button>
			<small>{m.import_hint()}</small>
		</div>
		{#if importError}
			<p role="alert">{importErrorMessages[importError]()}</p>
		{/if}

		<label>
			{m.recipe_field_ingredients()}
			<textarea rows="6" bind:value={input.ingredients}></textarea>
		</label>

		<div class="styled-field">
			<span class="field-label">{m.recipe_field_steps()}</span>
			<div class="toolbar" role="toolbar" aria-label={m.recipe_field_steps()}>
				<button type="button" onclick={() => wrapSteps('**', '**')} aria-label={m.notes_bold()}>
					<strong>B</strong>
				</button>
				<button type="button" onclick={() => wrapSteps('*', '*')} aria-label={m.notes_italic()}>
					<em>I</em>
				</button>
				{#each styleColors as color (color.key)}
					<button
						type="button"
						class="swatch note-{color.key}"
						onclick={() => wrapSteps(`[${color.key}]`, `[/${color.key}]`)}
						aria-label={color.label()}
					>
						{color.label()}
					</button>
				{/each}
			</div>
			<textarea
				rows="8"
				aria-label={m.recipe_field_steps()}
				bind:this={stepsField}
				bind:value={input.steps}></textarea>
			<small>{m.steps_hint()}</small>
		</div>

		<div>
			<button type="submit">{m.recipe_save()}</button>
			<a href={resolve('/recipes')}>{m.recipe_cancel()}</a>
		</div>
	</form>
</main>
