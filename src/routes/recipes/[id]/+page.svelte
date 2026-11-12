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
	import { fieldsOf, sourceHash, type RecipeFields } from '#lib/recipes/translation-fields.js';
	import {
		deleteOverride,
		fetchOverride,
		saveOverride,
		type EditedTranslation
	} from '#lib/recipes/recipe-api.js';
	import type { IngredientSource } from '#lib/recipes/recipe.js';
	import { TagNames } from '#lib/recipes/tag-names.svelte.js';
	import {
		MAX_TAGS_PER_RECIPE,
		formatStart,
		normalizeTag,
		sourceHref
	} from '#lib/recipes/recipe.js';
	import { loadImage } from '#lib/recipes/image-store.js';
	import { keepScreenAwake } from '#lib/wake-lock.js';

	let loaded = $state(false);
	let actionError = $state<string | null>(null);
	const tagNames = new TagNames();

	$effect(() => {
		tagNames.ensure(recipe?.tags ?? []);
	});

	let newTag = $state('');
	let tagLimitHit = $state(false);
	let translated = $state<{ fields: RecipeFields; failed: boolean } | null>(null);
	let translating = $state(false);
	let showOriginal = $state(false);
	let ingredientsTab = $state<'text' | 'image'>('image');
	let latestRequest = 0;
	/** The translation edited by hand, if there is one. It takes the place of the machine translation. */
	let override = $state<EditedTranslation | null>(null);
	let editingTranslation = $state(false);
	let translationDraft = $state({ title: '', ingredients: '', steps: '', notes: '' });
	let translationError = $state<string | null>(null);

	onMount(() => {
		recipeStore.load();
		loaded = true;
		// A recipe is read while cooking: keep the phone's screen on.
		return keepScreenAwake();
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
		Promise.all([
			translateFields(fieldsOf(current), current.id, locale, translationCache),
			fetchOverride(current.id, locale).catch(() => null)
		]).then(([result, saved]) => {
			if (request !== latestRequest) return;
			translated = result;
			override = saved;
			translating = false;
		});
	});

	// The recipe's images are loaded from the server as object URLs, revoked when they change.
	let imageUrls = $state<string[]>([]);
	$effect(() => {
		const current = recipe;
		if (!current || current.images.length === 0) return;
		let cancelled = false;
		let urls: string[] = [];
		Promise.all(current.images.map((id) => loadImage(current.id, id))).then((blobs) => {
			if (cancelled) return;
			urls = blobs.flatMap((blob) => (blob ? [URL.createObjectURL(blob)] : []));
			imageUrls = urls;
		});
		return () => {
			cancelled = true;
			urls.forEach((url) => URL.revokeObjectURL(url));
			imageUrls = [];
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
		recipe
			? showOriginal
				? fieldsOf(recipe)
				: override
					? override.fields
					: translated
						? translated.fields
						: fieldsOf(recipe)
			: null
	);

	/** The original text changed after the edited translation was saved. */
	const translationStale = $derived(
		override !== null && recipe !== undefined && override.hash !== sourceHash(recipe)
	);

	function lines(text: string): string[] {
		return text
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}

	function startEditTranslation() {
		if (!shown) return;
		showOriginal = false;
		translationDraft = {
			title: shown.title,
			ingredients: shown.ingredients.join('\n'),
			steps: shown.steps.join('\n'),
			notes: shown.notes
		};
		translationError = null;
		editingTranslation = true;
	}

	async function saveTranslation() {
		if (!recipe || !isLanguage(locale)) return;
		const fields = {
			title: translationDraft.title.trim(),
			ingredients: lines(translationDraft.ingredients),
			steps: lines(translationDraft.steps),
			notes: translationDraft.notes.trim()
		};
		const hash = sourceHash(recipe);
		try {
			await saveOverride(recipe.id, locale, { hash, fields });
			override = { hash, fields };
			editingTranslation = false;
		} catch {
			translationError = m.error_save_failed();
		}
	}

	async function resetTranslation() {
		if (!recipe || !isLanguage(locale)) return;
		try {
			await deleteOverride(recipe.id, locale);
			override = null;
			editingTranslation = false;
		} catch {
			translationError = m.error_save_failed();
		}
	}
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
							{tagNames.label(tag)}
							<button
								type="button"
								class="tag-remove"
								aria-label={m.tag_remove({ tag: tagNames.label(tag) })}
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
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={sourceHref(recipe.sourceUrl, recipe.sourceStart)}
						target="_blank"
						rel="noopener noreferrer">{m.recipe_open_source()}</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{#if recipe.sourceStart !== null}
						<small>{m.recipe_starts_at({ time: formatStart(recipe.sourceStart) })}</small>
					{/if}
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

			{#if !translating && recipe && isLanguage(locale)}
				<div class="translation-tools">
					{#if translationStale}
						<p role="status">{m.translation_stale()}</p>
					{/if}
					{#if override && !editingTranslation}
						<p class="meta">{m.translation_edited_note()}</p>
					{/if}
					{#if !editingTranslation}
						<button type="button" class="link-button" onclick={startEditTranslation}
							>{m.translation_edit()}</button
						>
					{:else}
						<form
							class="translation-edit"
							onsubmit={(event) => {
								event.preventDefault();
								saveTranslation();
							}}
						>
							<label>
								{m.recipe_field_title()}
								<input type="text" bind:value={translationDraft.title} />
							</label>
							<label>
								{m.recipe_field_ingredients()}
								<textarea rows="6" bind:value={translationDraft.ingredients}></textarea>
							</label>
							<label>
								{m.recipe_field_steps()}
								<textarea rows="8" bind:value={translationDraft.steps}></textarea>
							</label>
							<div class="translation-actions">
								<button type="submit">{m.translation_save()}</button>
								<button
									type="button"
									class="link-button"
									onclick={() => (editingTranslation = false)}>{m.recipe_cancel()}</button
								>
								{#if override}
									<button type="button" class="link-button danger" onclick={resetTranslation}
										>{m.translation_reset()}</button
									>
								{/if}
							</div>
							{#if translationError}
								<p role="alert">{translationError}</p>
							{/if}
						</form>
					{/if}
				</div>
			{/if}

			<section>
				<h2>{m.recipe_ingredients_heading()}</h2>
				{#if imageUrls.length > 0}
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
				{#if imageUrls.length === 0 || ingredientsTab === 'text'}
					<p class="meta">
						{m.ingredients_source()}: {sourceLabels[recipe.source]()}
						{#if recipe.source === 'web' && recipe.sourceUrl}
							·
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={sourceHref(recipe.sourceUrl, recipe.sourceStart)}
								target="_blank"
								rel="noopener noreferrer">{m.recipe_open_source()}</a
							>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/if}
					</p>
					{#if shown.ingredients.length > 0}
						<ul class="plain">
							{#each shown.ingredients as item, i (i)}
								<li>{item}</li>
							{/each}
						</ul>
					{/if}
				{:else if imageUrls.length > 0}
					<div class="gallery stacked">
						{#each imageUrls as url (url)}
							<img class="preview" src={url} alt={m.recipe_screenshot_alt()} />
						{/each}
					</div>
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
