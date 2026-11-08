<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
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
	import type { IngredientSource } from '#lib/recipes/recipe.js';
	import { tagLabel } from '#lib/recipes/tags.js';
	import { MAX_TAGS_PER_RECIPE, normalizeTag } from '#lib/recipes/recipe.js';
	import { loadImage } from '#lib/recipes/image-store.js';

	let loaded = $state(false);
	let actionError = $state<string | null>(null);
	let newTag = $state('');
	let tagLimitHit = $state(false);
	let translated = $state<{ fields: RecipeFields; failed: boolean } | null>(null);
	let translating = $state(false);
	let showOriginal = $state(false);
	let ingredientsTab = $state<'text' | 'image'>('image');
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

	// The screenshot is loaded from IndexedDB as an object URL, revoked when it changes.
	let screenshotUrl = $state<string | null>(null);
	$effect(() => {
		const current = recipe;
		if (!current?.hasImage) return;
		let url: string | null = null;
		let cancelled = false;
		loadImage(current.id).then((blob) => {
			if (blob && !cancelled) {
				url = URL.createObjectURL(blob);
				screenshotUrl = url;
			}
		});
		return () => {
			cancelled = true;
			if (url) URL.revokeObjectURL(url);
			screenshotUrl = null;
		};
	});

	/** Saves a new tag list for this recipe. Changes show at once and are undone if saving fails. */
	async function saveTags(tags: string[]) {
		if (!recipe) return;
		actionError = null;
		try {
			await recipeStore.update({ ...recipe, tags });
		} catch {
			actionError = m.error_save_failed();
		}
	}

	function removeTag(tag: string) {
		if (recipe) saveTags(recipe.tags.filter((t) => t !== tag));
	}

	function addTag() {
		const tag = normalizeTag(newTag);
		newTag = '';
		tagLimitHit = false;
		if (!recipe || !tag || recipe.tags.includes(tag)) return;
		if (recipe.tags.length >= MAX_TAGS_PER_RECIPE) {
			tagLimitHit = true;
			return;
		}
		saveTags([...recipe.tags, tag]);
	}

	async function toggleArchive() {
		if (!recipe) return;
		actionError = null;
		try {
			await recipeStore.setArchived([recipe.id], !recipe.archived);
		} catch {
			actionError = m.error_save_failed();
		}
	}

	async function deleteThis() {
		if (!recipe || !window.confirm(m.delete_confirm({ n: 1 }))) return;
		actionError = null;
		try {
			await recipeStore.remove([recipe.id]);
			goto(resolve('/recipes'));
		} catch {
			actionError = m.error_save_failed();
		}
	}

	const sourceLabels: Record<IngredientSource, () => string> = {
		typed: () => m.source_typed(),
		web: () => m.source_web(),
		image: () => m.source_image()
	};

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
			<section class="recipe-tags" aria-label={m.recipe_field_tags()}>
				<div class="tag-list">
					{#each recipe.tags as tag (tag)}
						<span class="tag on">
							{tagLabel(tag)}
							<button
								type="button"
								class="tag-remove"
								aria-label={m.tag_remove({ tag: tagLabel(tag) })}
								onclick={() => removeTag(tag)}>×</button
							>
						</span>
					{/each}
				</div>
				<div class="tag-add">
					<input
						type="text"
						bind:value={newTag}
						placeholder={m.tags_add_placeholder()}
						aria-label={m.tags_add_placeholder()}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ',') {
								event.preventDefault();
								addTag();
							}
						}}
					/>
					<button type="button" class="link-button" onclick={addTag}>{m.tags_add_button()}</button>
				</div>
				{#if tagLimitHit}
					<p role="alert">{m.tags_limit({ n: MAX_TAGS_PER_RECIPE })}</p>
				{/if}
			</section>
			<p class="recipe-actions">
				<a href={resolve('/recipes/[id]/edit', { id: recipe.id })}>{m.recipe_edit()}</a>
				{#if recipe.sourceUrl}
					<span aria-hidden="true">·</span>
					<!-- External user-supplied URL: resolve() only applies to app routes. -->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer"
						>{m.recipe_open_source()}</a
					>
				{/if}
				<span aria-hidden="true">·</span>
				<button type="button" class="link-button" onclick={toggleArchive}>
					{recipe.archived ? m.restore_action() : m.archive_action()}
				</button>
				{#if recipe.archived}
					<span aria-hidden="true">·</span>
					<button type="button" class="link-button danger" onclick={deleteThis}>
						{m.delete_action()}
					</button>
				{/if}
			</p>
			{#if actionError}
				<p role="alert">{actionError}</p>
			{/if}

			{#if translating}
				<p class="meta">{m.translating()}</p>
			{:else if translated}
				<p class="translation-bar">
					{#if translated.failed}
						<span role="status">{m.translation_failed()}</span>
					{:else}
						<button type="button" onclick={() => (showOriginal = !showOriginal)}>
							{showOriginal ? m.show_translation() : m.show_original()}
						</button>
					{/if}
				</p>
			{/if}

			<section>
				<h2>{m.recipe_ingredients_heading()}</h2>
				{#if screenshotUrl}
					<div class="tabs" role="tablist" aria-label={m.recipe_ingredients_heading()}>
						<button
							type="button"
							role="tab"
							class="tab"
							class:active={ingredientsTab === 'text'}
							aria-selected={ingredientsTab === 'text'}
							onclick={() => (ingredientsTab = 'text')}>{m.tab_text()}</button
						>
						<button
							type="button"
							role="tab"
							class="tab"
							class:active={ingredientsTab === 'image'}
							aria-selected={ingredientsTab === 'image'}
							onclick={() => (ingredientsTab = 'image')}>{m.tab_image()}</button
						>
					</div>
				{/if}
				{#if !screenshotUrl || ingredientsTab === 'text'}
					<p class="meta">
						{m.ingredients_source()}: {sourceLabels[recipe.source]()}
						{#if recipe.source === 'web' && recipe.sourceUrl}
							·
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer"
								>{m.recipe_open_source()}</a
							>
						{/if}
					</p>
					{#if shown.ingredients.length > 0}
						<ul class="plain">
							{#each shown.ingredients as item, i (i)}
								<li>{item}</li>
							{/each}
						</ul>
					{/if}
				{:else if screenshotUrl}
					<img class="preview" src={screenshotUrl} alt={m.recipe_screenshot_alt()} />
				{/if}
			</section>

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
