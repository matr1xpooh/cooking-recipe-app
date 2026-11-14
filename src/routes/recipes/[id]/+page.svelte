<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import RichText from '#lib/recipes/RichText.svelte';
	import { isLanguage } from '#lib/recipes/languages.js';
	import {
		decodeFieldsText,
		fieldsOf,
		replaceLine,
		sourceHash,
		type RecipeFields
	} from '#lib/recipes/translation-fields.js';
	import {
		deleteLine,
		deleteOverride,
		saveOverride,
		type EditedTranslation
	} from '#lib/recipes/recipe-api.js';
	import { editedFits, loadDisplay, shownFields, type Translated } from '#lib/recipes/display.js';
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
	import { placeIngredients, placeItems } from '#lib/recipes/ingredient-lines.js';
	import NoteBlock from '#lib/recipes/NoteBlock.svelte';

	/** The parts of a recipe that can be changed in place. */
	type EditPart = 'title' | 'ingredients' | 'steps';

	let loaded = $state(false);
	let actionError = $state<string | null>(null);
	const tagNames = new TagNames();

	$effect(() => {
		tagNames.ensure(recipe?.tags ?? []);
	});

	let newTag = $state('');
	let tagLimitHit = $state(false);
	let translated = $state<Translated | null>(null);
	let translating = $state(false);
	let showOriginal = $state(false);
	let ingredientsTab = $state<'text' | 'image'>('image');
	let latestRequest = 0;
	/** The translation edited by hand, if there is one. It takes the place of the machine translation. */
	let override = $state<EditedTranslation | null>(null);
	let editingTranslation = $state(false);
	let translationDraft = $state({ title: '', ingredients: '', steps: '', notes: '' });
	let translationError = $state<string | null>(null);
	/** The line being changed in place, and the text it started with. */
	let editing = $state<{ part: EditPart; index: number } | null>(null);
	let editDraft = $state('');
	let editStart = '';

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
		loadDisplay(current, locale, page.data.signedIn).then((result) => {
			if (request !== latestRequest) return;
			translated = result.translated;
			override = result.override;
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
		recipe ? (showOriginal ? fieldsOf(recipe) : shownFields(recipe, translated, override)) : null
	);

	/**
	 * The translation a saved edit starts from: the hand-edited one, else the machine
	 * translation. Null when there is none to edit (signed out, translating, or failed).
	 */
	const baseFields = $derived<RecipeFields | null>(
		recipe && (editedFits(recipe, override) || (translated && !translated.failed))
			? shownFields(recipe, translated, override)
			: null
	);

	/**
	 * A saved translation is stamped with the original it was made from. An edited one keeps
	 * its old stamp, so it stays flagged as out of date until it is reset.
	 */
	const baseHash = $derived(
		recipe ? (override && editedFits(recipe, override) ? override.hash : sourceHash(recipe)) : ''
	);

	const canEdit = $derived(
		baseFields !== null && page.data.signedIn && !showOriginal && isLanguage(locale)
	);

	/** The original text changed after the edited translation was saved. */
	const translationStale = $derived(
		override !== null && recipe !== undefined && override.hash !== sourceHash(recipe)
	);

	/** The edited translation no longer has the recipe's lines, so it is not shown. */
	const translationMisaligned = $derived(
		override !== null && recipe !== undefined && !editedFits(recipe, override)
	);

	/**
	 * The lines of a text box, one per line. Blank lines at the end are dropped; a blank line in the
	 * middle is kept, so the save can refuse it.
	 */
	function rawLines(text: string): string[] {
		const list = text.split('\n').map((line) => line.trim());
		while (list.length > 0 && list[list.length - 1] === '') list.pop();
		return list;
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

	/** Starts changing one line in place. */
	async function startInline(part: EditPart, index: number, text: string) {
		if (!canEdit) return;
		editStart = text;
		editDraft = text;
		editing = { part, index };
		await tick();
		document.querySelector<HTMLElement>('.inline-edit')?.focus();
	}

	/** Enter saves the line (by leaving it), Escape drops the change. */
	function inlineKey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			editing = null;
		} else if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			(event.currentTarget as HTMLElement).blur();
		}
	}

	/**
	 * Saves one changed line. The whole translation is sent, built from the stored list with
	 * only this line changed, so its headings and notes stay where they are.
	 */
	async function commitInline() {
		const current = editing;
		editing = null;
		if (!current || !recipe) return;
		const text = editDraft.trim();
		if (text === editStart) return;
		if (text.length === 0) {
			// Emptying an ingredient or step deletes it, in every language, once the user confirms.
			if (current.part !== 'title' && window.confirm(m.line_delete_confirm())) {
				await removeLine(current.part, current.index);
			}
			return;
		}
		if (!baseFields || !isLanguage(locale)) return;
		const fields = decodeFieldsText(replaceLine(baseFields, current.part, current.index, text));
		const hash = baseHash;
		try {
			await saveOverride(recipe.id, locale, { hash, fields });
			override = { hash, fields };
			translationError = null;
		} catch {
			translationError = m.error_save_failed();
		}
	}

	/** Deletes a line from the recipe in every language, then reloads the recipe. */
	async function removeLine(part: 'ingredients' | 'steps', index: number) {
		if (!recipe) return;
		try {
			await deleteLine(recipe.id, part, index);
			translationError = null;
			await recipeStore.load();
			if (recipeStore.loadError) translationError = m.error_load_failed();
		} catch {
			translationError = m.error_save_failed();
		}
	}

	async function saveTranslation() {
		if (!recipe || !baseFields || !isLanguage(locale)) return;
		const fields = {
			title: translationDraft.title.trim(),
			ingredients: rawLines(translationDraft.ingredients),
			steps: rawLines(translationDraft.steps),
			notes: translationDraft.notes.trim()
		};
		// A line can only be removed or added on the recipe, so the counts must stay the same.
		const blank =
			fields.title === '' || [...fields.ingredients, ...fields.steps].some((line) => line === '');
		if (blank) {
			translationError = m.translation_line_empty();
			return;
		}
		if (
			fields.ingredients.length !== baseFields.ingredients.length ||
			fields.steps.length !== baseFields.steps.length
		) {
			translationError = m.translation_line_count();
			return;
		}
		const hash = baseHash;
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
	/** The actions under the Ingredients heading, shown only when they apply. */
	const toolLinks = $derived([
		...(translated && !translated.failed
			? [
					{
						label: showOriginal ? m.show_translation() : m.show_original(),
						run: () => (showOriginal = !showOriginal)
					}
				]
			: []),
		...(page.data.signedIn && baseFields && !showOriginal && !editingTranslation
			? [{ label: m.translation_edit_all(), run: startEditTranslation }]
			: []),
		...(override && page.data.signedIn
			? [{ label: m.translation_reset(), run: autoTranslate }]
			: [])
	]);

	/** Drops the hand edits and goes back to the automatic translation, after asking. */
	async function autoTranslate() {
		if (!window.confirm(m.translation_reset_confirm())) return;
		await resetTranslation();
	}
</script>

{#snippet lineEdit(part: EditPart, index: number, text: string, rich: boolean)}
	{#if editing?.part === part && editing.index === index}
		<textarea
			class="inline-edit"
			rows="2"
			bind:value={editDraft}
			onblur={commitInline}
			onkeydown={inlineKey}></textarea>
	{:else if canEdit}
		<button type="button" class="editable" onclick={() => startInline(part, index, text)}>
			{#if rich}<RichText source={text} />{:else}{text}{/if}
		</button>
	{:else if rich}
		<RichText source={text} />
	{:else}
		{text}
	{/if}
{/snippet}

<svelte:head>
	<title>{recipe?.title ?? m.recipes_title()}</title>
</svelte:head>

<main>
	<p class="back"><a href={resolve('/recipes')}>← {m.recipes_title()}</a></p>

	{#if recipe && shown}
		<article>
			<h1>
				{#if editing?.part === 'title'}
					<input
						type="text"
						class="inline-edit"
						bind:value={editDraft}
						aria-label={m.recipe_field_title()}
						onblur={commitInline}
						onkeydown={inlineKey}
					/>
				{:else if canEdit}
					<button
						type="button"
						class="editable"
						onclick={() => startInline('title', 0, shown.title)}>{shown.title}</button
					>
				{:else}
					{shown.title}
				{/if}
			</h1>
			<p class="recipe-actions">
				{#if shown.steps.length > 0}<a href={resolve('/recipes/[id]/cook', { id: recipe.id })}
						>{m.cook_open()}</a
					>
					<span aria-hidden="true">·</span>
				{/if}
				{#if page.data.signedIn}<a href={resolve('/recipes/[id]/edit', { id: recipe.id })}
						>{m.recipe_edit()}</a
					>{/if}
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
				{#if page.data.signedIn}<button type="button" class="link-button" onclick={toggleArchive}>
						{recipe.archived ? m.restore_action() : m.archive_action()}
					</button>
				{/if}
				{#if recipe.archived && page.data.signedIn}
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
			{:else if translated?.failed}
				<p class="translation-bar">
					<span role="status">{m.translation_failed()}</span>
				</p>
			{/if}

			<section>
				<h2>{m.recipe_ingredients_heading()}</h2>
				{#if !translating && recipe && isLanguage(locale)}
					<div class="translation-tools">
						{#if override && !editingTranslation}<p class="meta tools-status">
								{m.translation_edited_note()}
							</p>{/if}
						{#if translationMisaligned}
							<p role="status">{m.translation_misaligned()}</p>
						{:else if translationStale}
							<p role="status">{m.translation_stale()}</p>
						{/if}
						{#if translationError}
							<p role="alert">{translationError}</p>
						{/if}
						<p class="tools-links">
							{#each toolLinks as link, i (i)}
								{#if i > 0}<span aria-hidden="true">|</span>{/if}
								<button type="button" class="link-button" onclick={link.run}>{link.label}</button>
							{/each}
						</p>
						{#if editingTranslation && page.data.signedIn}
							<form
								class="translation-edit"
								onsubmit={(event) => {
									event.preventDefault();
									saveTranslation();
								}}
							>
								<div class="translation-columns">
									<fieldset class="translation-side">
										<legend>{m.translation_original()}</legend>
										<label>
											{m.recipe_field_title()}
											<input type="text" value={recipe.title} readonly />
										</label>
										<label>
											{m.recipe_field_ingredients()}
											<textarea rows="6" value={recipe.ingredients.join('\n')} readonly></textarea>
										</label>
										<label>
											{m.recipe_field_steps()}
											<textarea rows="8" value={recipe.steps.join('\n')} readonly></textarea>
										</label>
									</fieldset>
									<fieldset class="translation-side">
										<legend>{m.translation_yours()}</legend>
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
									</fieldset>
								</div>
								<div class="translation-actions">
									<button type="submit">{m.translation_save()}</button>
									<button
										type="button"
										class="link-button"
										onclick={() => (editingTranslation = false)}>{m.recipe_cancel()}</button
									>
								</div>
							</form>
						{/if}
					</div>
				{/if}
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
					</p>
					{#each placeIngredients(shown.ingredients) as group, g (g)}
						{#if group.heading !== null}
							<h3 class="ingredient-heading">
								{@render lineEdit('ingredients', group.heading.index, group.heading.text, false)}
							</h3>
						{/if}
						{#if group.items.length > 0}
							<ul class="plain">
								{#each group.items as entry, i (i)}
									<li class:note-only={entry.item === null}>
										{#if entry.item !== null}{@render lineEdit(
												'ingredients',
												entry.item.index,
												entry.item.text,
												false
											)}{/if}{#if entry.notes.length > 0}<NoteBlock
												notes={entry.notes.map((n) => n.note)}
											/>{/if}
									</li>
								{/each}
							</ul>
						{/if}
					{/each}
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
						{#each placeItems(shown.steps) as entry, i (i)}
							<li class:note-only={entry.item === null}>
								{#if entry.item !== null}{@render lineEdit(
										'steps',
										entry.item.index,
										entry.item.text,
										true
									)}{/if}{#if entry.notes.length > 0}<NoteBlock
										notes={entry.notes.map((n) => n.note)}
									/>{/if}
							</li>
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
			<section class="recipe-tags" aria-label={m.recipe_field_tags()}>
				<div class="tag-list">
					{#each recipe.tags as tag (tag)}
						<span class="tag on">
							{tagNames.label(tag)}
							<button
								type="button"
								class="tag-remove"
								hidden={!page.data.signedIn}
								aria-label={m.tag_remove({ tag: tagNames.label(tag) })}
								onclick={() => removeTag(tag)}>×</button
							>
						</span>
					{/each}
				</div>
				{#if page.data.signedIn}
					<div class="tag-add">
						<input
							type="text"
							bind:value={newTag}
							placeholder={m.tags_add_placeholder()}
							aria-label={m.tags_add_placeholder()}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
									event.preventDefault();
									addTag();
								}
							}}
						/>
					</div>
				{/if}
				{#if tagLimitHit}
					<p role="alert">{m.tags_limit({ n: MAX_TAGS_PER_RECIPE })}</p>
				{/if}
			</section>
		</article>
	{:else if loaded}
		<h1>{m.recipe_not_found()}</h1>
	{/if}
</main>
