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
		addLines,
		DuplicateRecipeError,
		deleteImage,
		uploadImage,
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
		hasErrors,
		parseStart,
		validateRecipeInput,
		formatStart,
		normalizeTag,
		sourceHref
	} from '#lib/recipes/recipe.js';
	import { loadImage } from '#lib/recipes/image-store.js';
	import { keepScreenAwake } from '#lib/wake-lock.js';
	import { lineRange, placeIngredients } from '#lib/recipes/ingredient-lines.js';
	import NoteBlock from '#lib/recipes/NoteBlock.svelte';
	import PhotoButtons from '#lib/recipes/PhotoButtons.svelte';
	import {
		newIngredientLines,
		photoProblem,
		readImageText,
		type PhotoErrorKey
	} from '#lib/recipes/photos.js';

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
	/** The tab the user chose; null until they choose, then images if there are any. */
	let ingredientsTab = $state<'text' | 'image' | null>(null);
	/** Photo changes in progress, and the reason the last one failed. */
	let photoBusy = $state(false);
	let photoError = $state<PhotoErrorKey | 'no_new_lines' | null>(null);
	let latestRequest = 0;
	/** The translation edited by hand, if there is one. It takes the place of the machine translation. */
	let override = $state<EditedTranslation | null>(null);
	let translationError = $state<string | null>(null);
	/** The source link and start time, while they are being changed. */
	let sourceEditing = $state(false);
	let sourceDraft = $state({ url: '', start: '' });
	let sourceError = $state<string | null>(null);
	let sourceDuplicate = $state<{ id: string; title: string } | null>(null);
	/** The line being changed in place, whether it is a note, and the text it started with. */
	let editing = $state<{ part: EditPart; index: number; note: boolean } | null>(null);
	let editDraft = $state('');
	/** The line being added with a "+" (where it goes), and what has been typed for it. */
	let adding = $state<{ part: 'ingredients' | 'steps'; at: number } | null>(null);
	let addDraft = $state('');
	let openPhoto = $state<string | null>(null);
	let showAddPhotos = $state(false);
	let editStart = '';

	onMount(() => {
		recipeStore.load();
		loaded = true;
		// A recipe is read while cooking: keep the phone's screen on.
		return keepScreenAwake();
	});

	const recipe = $derived(recipeStore.recipes.find((r) => r.id === page.params.id));
	const tab = $derived(ingredientsTab ?? (recipe && recipe.images.length > 0 ? 'image' : 'text'));
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

	/** The recipe's photos with their object URLs. Reloaded only when the photo list changes. */
	let photos = $state<{ id: string; url: string }[]>([]);
	const photoKey = $derived(recipe ? `${recipe.id}|${recipe.images.join(',')}` : '');
	$effect(() => {
		const key = photoKey;
		if (!key) return;
		const bar = key.indexOf('|');
		const recipeId = key.slice(0, bar);
		const ids = key
			.slice(bar + 1)
			.split(',')
			.filter((id) => id !== '');
		if (ids.length === 0) {
			photos = [];
			return;
		}
		let cancelled = false;
		const urls: string[] = [];
		Promise.all(ids.map((id) => loadImage(recipeId, id))).then((blobs) => {
			if (cancelled) return;
			photos = ids.flatMap((id, i) => {
				const blob = blobs[i];
				if (!blob) return [];
				const url = URL.createObjectURL(blob);
				urls.push(url);
				return [{ id, url }];
			});
		});
		return () => {
			cancelled = true;
			urls.forEach((url) => URL.revokeObjectURL(url));
			photos = [];
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

	/** Signed in: a tap changes the original (while showing it) or this language's translation. */
	const canEdit = $derived(
		page.data.signedIn && isLanguage(locale) && (showOriginal || baseFields !== null)
	);

	/** The original text changed after the edited translation was saved. */
	const translationStale = $derived(
		override !== null && recipe !== undefined && override.hash !== sourceHash(recipe)
	);

	/** The edited translation no longer has the recipe's lines, so it is not shown. */
	const translationMisaligned = $derived(
		override !== null && recipe !== undefined && !editedFits(recipe, override)
	);

	/** Starts changing one line in place. */
	async function startInline(part: EditPart, index: number, text: string, note = false) {
		if (!canEdit) return;
		editStart = text;
		editDraft = text;
		editing = { part, index, note };
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
			// A note is not deleted by emptying it: its delete would take the notes below it too.
			if (current.note) {
				translationError = m.note_empty();
				return;
			}
			// Emptying an ingredient or step deletes it, in every language, once the user confirms.
			if (current.part !== 'title' && window.confirm(m.line_delete_confirm())) {
				await removeLine(current.part, current.index);
			}
			return;
		}
		if (showOriginal) {
			await saveOriginal(replaceLine(fieldsOf(recipe), current.part, current.index, text));
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

	/**
	 * Saves the original recipe text, as shown while "View in original language" is on. Other
	 * languages' edited translations are then flagged as out of date.
	 */
	async function saveOriginal(changed: RecipeFields) {
		if (!recipe) return;
		const fields = decodeFieldsText(changed);
		try {
			await recipeStore.update({
				...recipe,
				title: fields.title,
				ingredients: fields.ingredients,
				steps: fields.steps,
				notes: fields.notes
			});
			translationError = null;
		} catch {
			translationError = m.error_save_failed();
		}
	}

	/** Drops this language's hand edits, so the automatic translation is shown again. */
	async function resetTranslation() {
		if (!recipe || !isLanguage(locale)) return;
		try {
			await deleteOverride(recipe.id, locale);
			override = null;
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
		...(override && page.data.signedIn ? [{ label: m.translation_reset(), run: resetEdits }] : [])
	]);

	/** Opens the source link and start time for changing, filled with the current values. */
	function startSourceEdit() {
		if (!recipe) return;
		sourceDraft = {
			url: recipe.sourceUrl ?? '',
			start: recipe.sourceStart === null ? '' : formatStart(recipe.sourceStart)
		};
		sourceError = null;
		sourceDuplicate = null;
		sourceEditing = true;
	}

	/** Saves a changed source link and start time, after the same checks as the add form. */
	async function saveSource() {
		if (!recipe) return;
		const url = sourceDraft.url.trim();
		const errors = validateRecipeInput({
			title: recipe.title,
			sourceUrl: url,
			sourceStart: sourceDraft.start,
			ingredients: '',
			steps: '',
			tags: []
		});
		if (hasErrors(errors)) {
			sourceError = errors.sourceUrl ? m.error_source_url_invalid() : m.error_start_invalid();
			return;
		}
		sourceError = null;
		sourceDuplicate = null;
		try {
			await recipeStore.update({
				...recipe,
				sourceUrl: url.length > 0 ? url : null,
				sourceStart: url.length > 0 ? (parseStart(sourceDraft.start) ?? null) : null
			});
			sourceEditing = false;
		} catch (error) {
			if (error instanceof DuplicateRecipeError) sourceDuplicate = error.existing;
			else sourceError = m.error_save_failed();
		}
	}

	const photoErrorMessages: Record<PhotoErrorKey | 'no_new_lines', () => string> = {
		image_too_large: () => m.error_image_too_large(),
		image_invalid: () => m.error_image_invalid(),
		clipboard_unavailable: () => m.error_clipboard_unavailable(),
		clipboard_denied: () => m.error_clipboard_denied(),
		no_image_on_clipboard: () => m.error_no_image_on_clipboard(),
		no_text_found: () => m.error_no_text_found(),
		ocr_failed: () => m.error_ocr_failed(),
		no_new_lines: () => m.photo_no_new_lines()
	};

	/** Adds photos to the recipe. Each is uploaded, then the recipe is saved with the new ids. */
	async function addPhotos(files: File[]) {
		if (!recipe) return;
		photoError = null;
		const accepted: File[] = [];
		for (const file of files) {
			const problem = photoProblem(file);
			if (problem) photoError = problem;
			else accepted.push(file);
		}
		if (accepted.length === 0) return;
		actionError = null;
		photoBusy = true;
		try {
			const ids: string[] = [];
			for (const file of accepted) ids.push(await uploadImage(recipe.id, file));
			await recipeStore.update({ ...recipe, images: [...recipe.images, ...ids] });
			ingredientsTab = 'image';
			showAddPhotos = false;
		} catch {
			actionError = m.error_save_failed();
		} finally {
			photoBusy = false;
		}
	}

	/** Removes a photo: the recipe is saved without it first, then the picture is deleted. */
	async function removePhoto(id: string) {
		if (!recipe) return;
		actionError = null;
		try {
			await recipeStore.update({ ...recipe, images: recipe.images.filter((i) => i !== id) });
			await deleteImage(recipe.id, id);
		} catch {
			actionError = m.error_save_failed();
		}
	}

	/** Reads the ingredient lines from a photo and adds the ones the recipe does not have yet. */
	async function readPhoto(id: string) {
		if (!recipe) return;
		photoError = null;
		photoBusy = true;
		try {
			const blob = await loadImage(recipe.id, id);
			const result = blob ? await readImageText(blob) : { error: 'ocr_failed' as const };
			if ('error' in result) {
				photoError = result.error;
				return;
			}
			const lines = newIngredientLines(recipe.ingredients, result.lines);
			if (lines.length === 0) {
				photoError = 'no_new_lines';
				return;
			}
			// The server takes at most 20 lines a request.
			for (let i = 0; i < lines.length; i += 20) {
				await addLines(recipe.id, 'ingredients', lines.slice(i, i + 20));
			}
			await recipeStore.load();
		} catch {
			actionError = m.error_save_failed();
		} finally {
			photoBusy = false;
		}
	}

	/** The steps in groups under their headings, each group numbered from its first step. */
	const stepGroups = $derived.by(() => {
		let next = 1;
		return shown
			? placeIngredients(shown.steps).map((group) => {
					const start = next;
					next += group.items.filter((item) => item.item !== null).length;
					return { ...group, start };
				})
			: [];
	});

	/** Opens a one-line box at a position in a list. */
	async function startAdd(part: 'ingredients' | 'steps', at: number) {
		adding = { part, at };
		addDraft = '';
		await tick();
		document.querySelector<HTMLElement>('.add-new')?.focus();
	}

	/** Adds the typed line at its position, in every language. Empty or cancelled adds nothing. */
	async function commitAdd() {
		const current = adding;
		adding = null;
		const text = addDraft.trim();
		addDraft = '';
		if (!current || !recipe || text === '') return;
		try {
			await addLines(recipe.id, current.part, [text], current.at);
			translationError = null;
			await recipeStore.load();
			if (recipeStore.loadError) translationError = m.error_load_failed();
		} catch {
			translationError = m.error_save_failed();
		}
	}

	/** Enter saves the line (by leaving it), Escape drops it. */
	function addKey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			adding = null;
			addDraft = '';
		} else if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			(event.currentTarget as HTMLElement).blur();
		}
	}

	/** Discards the hand edits after asking, so the automatic translation is shown again. */
	async function resetEdits() {
		if (!window.confirm(m.translation_reset_confirm())) return;
		await resetTranslation();
	}
</script>

{#snippet addSlot(part: 'ingredients' | 'steps', at: number)}
	{#if page.data.signedIn}
		{#if adding?.part === part && adding.at === at}
			<textarea
				class="inline-edit add-new"
				rows="1"
				placeholder={part === 'steps' ? m.add_step_placeholder() : m.add_ingredient_placeholder()}
				aria-label={part === 'steps' ? m.add_step_placeholder() : m.add_ingredient_placeholder()}
				bind:value={addDraft}
				onblur={commitAdd}
				onkeydown={addKey}></textarea>
		{:else}
			<button
				type="button"
				class="add-slot"
				aria-label={m.add_slot_label()}
				title={m.add_slot_label()}
				onclick={() => startAdd(part, at)}>+</button
			>
		{/if}
	{/if}
{/snippet}

{#snippet lineEdit(part: EditPart, index: number, text: string, rich: boolean, note = false)}
	{#if editing?.part === part && editing.index === index}
		<textarea
			class="inline-edit"
			rows="2"
			bind:value={editDraft}
			onblur={commitInline}
			onkeydown={inlineKey}></textarea>
	{:else if canEdit}
		<button type="button" class="editable" onclick={() => startInline(part, index, text, note)}>
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
			{#if shown.steps.length > 0}
				<p class="cook-row">
					<a class="cook-button" href={resolve('/recipes/[id]/cook', { id: recipe.id })}
						>{m.cook_open()}</a
					>
				</p>
			{/if}
			<p class="recipe-actions">
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
				{#if page.data.signedIn}<button type="button" class="link-button" onclick={startSourceEdit}
						>{recipe.sourceUrl ? m.source_change() : m.source_add()}</button
					><span aria-hidden="true">·</span>{/if}{#if page.data.signedIn}<button
						type="button"
						class="link-button"
						onclick={toggleArchive}
					>
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
			{#if sourceEditing && page.data.signedIn}
				<form
					class="source-edit"
					onsubmit={(event) => {
						event.preventDefault();
						saveSource();
					}}
				>
					<label>
						{m.recipe_field_source_url()}
						<input type="url" bind:value={sourceDraft.url} />
					</label>
					<label>
						{m.recipe_field_start()}
						<input
							type="text"
							inputmode="numeric"
							placeholder="4:30"
							bind:value={sourceDraft.start}
						/>
						<small>{m.recipe_start_hint()}</small>
					</label>
					{#if sourceError}
						<p role="alert">{sourceError}</p>
					{/if}
					{#if sourceDuplicate}
						<p role="alert">
							{m.error_duplicate()}
							<a href={resolve('/recipes/[id]', { id: sourceDuplicate.id })}
								>{sourceDuplicate.title}</a
							>
						</p>
					{/if}
					<div class="source-actions">
						<button type="submit">{m.source_save()}</button>
						<button type="button" class="link-button" onclick={() => (sourceEditing = false)}
							>{m.recipe_cancel()}</button
						>
					</div>
				</form>
			{/if}
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
						{#if showOriginal && page.data.signedIn}<p class="meta tools-status">
								{m.original_edit_note()}
							</p>{/if}
						{#if override}<p class="meta tools-status">
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
					</div>
				{/if}
				{#if recipe.images.length > 0 || page.data.signedIn}
					<div class="tabs" role="tablist" aria-label={m.recipe_ingredients_heading()}>
						<button
							type="button"
							role="tab"
							class="tab"
							class:active={tab === 'text'}
							aria-selected={tab === 'text'}
							onclick={() => (ingredientsTab = 'text')}>{m.tab_text()}</button
						>
						<button
							type="button"
							role="tab"
							class="tab"
							class:active={tab === 'image'}
							aria-selected={tab === 'image'}
							onclick={() => (ingredientsTab = 'image')}>{m.tab_image()}</button
						>
					</div>
				{/if}
				{#if tab === 'text'}
					<p class="meta">
						{m.ingredients_source()}: {sourceLabels[recipe.source]()}
					</p>
					{@render addSlot('ingredients', 0)}
					{#each placeIngredients(shown.ingredients) as group, g (g)}
						{#if group.heading !== null}
							<h3 class="ingredient-heading">
								{@render lineEdit('ingredients', group.heading.index, group.heading.text, false)}
							</h3>
							{#if group.items.length === 0}{@render addSlot(
									'ingredients',
									group.heading.index + 1
								)}{/if}
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
												indexes={entry.notes.map((n) => n.index)}
												part="ingredients"
												edit={lineEdit}
											/>{/if}{#if entry.item !== null}{@render addSlot(
												'ingredients',
												lineRange(recipe.ingredients, entry.item.index).end
											)}{/if}
									</li>
								{/each}
							</ul>
						{/if}
					{/each}
				{:else}
					{#if recipe.images.length === 0}
						<p class="meta">{m.image_empty()}</p>
					{/if}
					<div class="gallery stacked">
						{#each photos as photo (photo.id)}
							<figure class="gallery-item">
								<img class="preview" src={photo.url} alt={m.recipe_screenshot_alt()} />
								{#if page.data.signedIn}
									<figcaption class="image-actions">
										<button
											type="button"
											class="link-button"
											onclick={() => (openPhoto = openPhoto === photo.id ? null : photo.id)}
											>{m.photo_edit()}</button
										>
										{#if openPhoto === photo.id}
											<button
												type="button"
												class="link-button"
												disabled={photoBusy}
												onclick={() => readPhoto(photo.id)}>{m.image_read_text()}</button
											>
											<button
												type="button"
												class="link-button danger"
												onclick={() => {
													openPhoto = null;
													removePhoto(photo.id);
												}}>{m.image_remove()}</button
											>
											<button type="button" class="link-button" onclick={() => (openPhoto = null)}
												>{m.photo_done()}</button
											>
										{/if}
									</figcaption>
								{/if}
							</figure>
						{/each}
					</div>
					{#if page.data.signedIn}
						{#if photos.length === 0 || showAddPhotos}
							<PhotoButtons
								disabled={photoBusy}
								onfiles={addPhotos}
								onerror={(key) => (photoError = key)}
							/>
							{#if photos.length > 0}
								<button type="button" class="link-button" onclick={() => (showAddPhotos = false)}
									>{m.recipe_cancel()}</button
								>
							{/if}
						{:else}
							<button type="button" class="link-button" onclick={() => (showAddPhotos = true)}
								>{m.photo_add_more()}</button
							>
						{/if}
					{/if}
					{#if photoError}
						<p role="alert">{photoErrorMessages[photoError]()}</p>
					{/if}
				{/if}
			</section>

			{#if shown.steps.length > 0 || page.data.signedIn}
				<section>
					<h2>{m.recipe_steps_heading()}</h2>
					{@render addSlot('steps', 0)}
					{#each stepGroups as group, g (g)}
						{#if group.heading !== null}
							<h3 class="ingredient-heading">
								{@render lineEdit('steps', group.heading.index, group.heading.text, true)}
							</h3>
							{#if group.items.length === 0}{@render addSlot('steps', group.heading.index + 1)}{/if}
						{/if}
						{#if group.items.length > 0}
							<ol start={group.start}>
								{#each group.items as entry, i (i)}
									<li class:note-only={entry.item === null}>
										{#if entry.item !== null}{@render lineEdit(
												'steps',
												entry.item.index,
												entry.item.text,
												true
											)}{/if}{#if entry.notes.length > 0}<NoteBlock
												notes={entry.notes.map((n) => n.note)}
												indexes={entry.notes.map((n) => n.index)}
												part="steps"
												edit={lineEdit}
											/>{/if}{#if entry.item !== null}{@render addSlot(
												'steps',
												lineRange(recipe.steps, entry.item.index).end
											)}{/if}
									</li>
								{/each}
							</ol>
						{/if}
					{/each}
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
