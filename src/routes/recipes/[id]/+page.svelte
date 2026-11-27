<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import RichText from '#lib/recipes/RichText.svelte';
	import ShareRecipe from '#lib/recipes/ShareRecipe.svelte';
	import { addToShoppingList } from '#lib/recipes/shopping-store.js';
	import { factorFor, firstAmount, hasAmount, scaleLine } from '#lib/recipes/scale.js';
	import { iconFor } from '#lib/recipes/ingredient-icons.js';
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
		setLineKind,
		DuplicateRecipeError,
		deleteImage,
		uploadImage,
		deleteLine,
		deleteOverride,
		saveGlossaryRule,
		saveOverride,
		type EditedTranslation
	} from '#lib/recipes/recipe-api.js';
	import { fixFromEdit } from '#lib/recipes/glossary.js';
	import {
		editedFits,
		forgetGlossary,
		loadDisplay,
		shownFields,
		type Translated
	} from '#lib/recipes/display.js';
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
	import {
		isHeading,
		isNote,
		HEADING_MARKER,
		toNoteLine,
		lineRange,
		placeIngredients,
		splitNote
	} from '#lib/recipes/ingredient-lines.js';
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
	/** What a line can be changed to: a step, a tip under the line above, or a section heading. */
	type LineKind = 'step' | 'tip' | 'section';

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
	/** What a line added with "+" will be: a plain item, a tip or note under the line above, or a section name. */
	type AddKind = 'item' | 'tip' | 'section';
	let adding = $state<{
		part: 'ingredients' | 'steps';
		at: number;
		kind: AddKind | 'choose';
	} | null>(null);
	let addDraft = $state('');
	let openPhoto = $state<string | null>(null);
	let showAddPhotos = $state(false);
	let sharing = $state(false);
	let editStart = '';
	/**
	 * The scale of the ingredient lines: a view only, never saved to the recipe. ×1 is the recipe
	 * as written. The panel shows the steps; while it is open, tapping a line sets its quantity.
	 */
	let scale = $state(1);
	let scaleOpen = $state(false);
	/** Edit mode: the "+" buttons and tap-to-edit show only while it is on. */
	let editMode = $state(false);
	/** The ingredient whose quantity is being typed, and what is typed so far. */
	let quantityDraft = $state<{ index: number; text: string } | null>(null);
	const scaleSteps = [
		{ factor: 0.5, label: '×½' },
		{ factor: 1, label: '×1' },
		{ factor: 2, label: '×2' }
	];

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
		editMode && page.data.signedIn && isLanguage(locale) && (showOriginal || baseFields !== null)
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
	/**
	 * What the editor offers for a line, as buttons: a plain line can become a tip or a section (not
	 * a section when tips sit under it), a tip can become a step, and a section a step again.
	 */
	function kindOptions(part: EditPart, index: number): { kind: LineKind; label: string }[] {
		if (!recipe || part === 'title') return [];
		const lines = recipe[part];
		const line = lines[index];
		if (line === undefined) return [];
		const stepLabel = part === 'steps' ? m.line_make_step() : m.line_make_ingredient();
		if (isHeading(line) || splitNote(line) !== null) return [{ kind: 'step', label: stepLabel }];
		const options: { kind: LineKind; label: string }[] = [
			{ kind: 'tip', label: m.line_make_tip() }
		];
		const next = lines[index + 1];
		const hasTips = next !== undefined && splitNote(next) !== null;
		if (!hasTips) options.push({ kind: 'section', label: m.line_make_section() });
		return options;
	}

	/** Saves any typed text, then changes the line's kind: a step, a tip, or a section. */
	async function changeKind(kind: LineKind) {
		const current = editing;
		if (!current || !recipe || current.part === 'title') return;
		await commitInline();
		try {
			await setLineKind(recipe.id, current.part, current.index, kind);
			translationError = null;
			await recipeStore.load();
			if (recipeStore.loadError) translationError = m.error_load_failed();
		} catch {
			translationError = m.error_save_failed();
		}
	}

	/** Deletes the line being edited, after the user confirms. Its tips go with it. */
	async function deleteFromEditor() {
		const current = editing;
		editing = null;
		if (!current || current.part === 'title') return;
		if (!window.confirm(m.line_delete_confirm())) return;
		await removeLine(current.part, current.index);
	}

	async function commitInline() {
		const current = editing;
		editing = null;
		if (!current || !recipe) return;
		const text = editDraft.trim();
		if (text === editStart) return;
		if (text.length === 0) {
			// Emptying a line keeps its text. Deleting is its own button.
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
			await offerFix(current.part, current.index, editStart, text);
		} catch {
			translationError = m.error_save_failed();
		}
	}

	/**
	 * When a translated ingredient's name was corrected by hand, offers to use that correction in
	 * every recipe in this language. Other recipes pick it up the next time they are translated.
	 */
	async function offerFix(part: EditPart, index: number, shownBefore: string, text: string) {
		if (part !== 'ingredients' || !recipe || !isLanguage(locale)) return;
		const original = recipe.ingredients[index];
		if (original === undefined || isHeading(original) || isNote(original)) return;
		const fix = fixFromEdit(original, shownBefore, text);
		if (!fix || !window.confirm(m.glossary_remember({ from: fix.source, to: fix.target }))) return;
		try {
			await saveGlossaryRule({ language: locale, ...fix });
			forgetGlossary();
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

	/** Closes the More menu after one of its items is used. */
	function closeMore(event: MouseEvent) {
		(event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
	}

	/** Leaves edit mode and drops any line being changed. */
	function leaveEdit() {
		editMode = false;
		editing = null;
		quantityDraft = null;
	}

	/** Adds this recipe to the list being built, and opens the list. */
	function addToShopping() {
		if (!recipe) return;
		addToShoppingList([recipe.id], undefined, scale);
		goto(resolve('/shopping'));
	}

	/** Starts typing a quantity: the ingredient's amount as it shows now. */
	function startQuantity(index: number) {
		const line = shown?.ingredients[index];
		if (line === undefined) return;
		const current = firstAmount(scaleLine(line, scale));
		quantityDraft = {
			index,
			text: current === null ? '' : String(Math.round(current * 100) / 100)
		};
	}

	/** Applies the typed quantity: the scale becomes the one that turns the line's amount into it. */
	function applyQuantity() {
		if (!quantityDraft || !shown) return;
		const line = shown.ingredients[quantityDraft.index] ?? '';
		const factor = factorFor(line, Number(quantityDraft.text.replace(',', '.')));
		if (factor !== null) scale = factor;
		quantityDraft = null;
	}

	function setQuantityText(value: string) {
		if (quantityDraft) quantityDraft.text = value;
	}

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

	/** Shows the small menu of what to add at a position in a list. */
	function startAdd(part: 'ingredients' | 'steps', at: number) {
		adding = { part, at, kind: 'choose' };
		addDraft = '';
	}

	/** Opens the one-line box for the chosen kind. */
	async function chooseKind(kind: AddKind) {
		if (!adding) return;
		adding = { ...adding, kind };
		addDraft = '';
		await tick();
		document.querySelector<HTMLElement>('.add-new')?.focus();
	}

	/** A tip or note goes under a line, so the line above must exist and must not be a section name. */
	function canTip(part: 'ingredients' | 'steps', at: number): boolean {
		const lines = part === 'steps' ? (recipe?.steps ?? []) : (recipe?.ingredients ?? []);
		return at > 0 && !isHeading(lines[at - 1] ?? '');
	}

	/** Placeholder of the add box for the kind chosen. */
	function addPlaceholder(part: 'ingredients' | 'steps', kind: AddKind | 'choose'): string {
		if (kind === 'section') return m.add_section_placeholder();
		if (kind === 'tip')
			return part === 'steps' ? m.add_tip_placeholder() : m.add_note_placeholder();
		return part === 'steps' ? m.add_step_placeholder() : m.add_ingredient_placeholder();
	}

	/** Adds the typed line at its position, in every language. Empty or cancelled adds nothing. */
	async function commitAdd() {
		const current = adding;
		adding = null;
		const text = addDraft.trim();
		addDraft = '';
		if (!current || !recipe || text === '') return;
		try {
			const line =
				current.kind === 'tip'
					? toNoteLine(text)
					: current.kind === 'section'
						? HEADING_MARKER + text
						: text;
			await addLines(recipe.id, current.part, [line], current.at);
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
	{#if editMode && page.data.signedIn}
		{#if adding?.part === part && adding.at === at}
			{#if adding.kind === 'choose'}
				<div class="add-kinds" role="group" aria-label={m.add_slot_label()}>
					<button type="button" class="kind-chip" onclick={() => chooseKind('item')}
						>{part === 'steps' ? m.add_kind_step() : m.add_kind_ingredient()}</button
					>
					{#if canTip(part, at)}
						<button type="button" class="kind-chip" onclick={() => chooseKind('tip')}
							>{part === 'steps' ? m.add_kind_tip() : m.add_kind_note()}</button
						>
					{/if}
					<button type="button" class="kind-chip" onclick={() => chooseKind('section')}
						>{m.add_kind_section()}</button
					>
					<button type="button" class="link-button" onclick={() => (adding = null)}
						>{m.recipe_cancel()}</button
					>
				</div>
			{:else}
				<textarea
					class="inline-edit add-new"
					rows="1"
					placeholder={addPlaceholder(part, adding.kind)}
					aria-label={addPlaceholder(part, adding.kind)}
					bind:value={addDraft}
					onblur={commitAdd}
					onkeydown={addKey}></textarea>
			{/if}
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

{#snippet lineEdit(
	part: EditPart,
	index: number,
	text: string,
	rich: boolean,
	note = false,
	display = text,
	scalable = false
)}
	{#if editing?.part === part && editing.index === index}
		<textarea
			class="inline-edit"
			rows="2"
			bind:value={editDraft}
			onblur={commitInline}
			onkeydown={inlineKey}></textarea>
		{#if part !== 'title'}
			<div class="line-actions">
				{#each kindOptions(part, index) as option (option.kind)}
					<button
						type="button"
						class="link-button"
						onmousedown={(event) => event.preventDefault()}
						onclick={() => changeKind(option.kind)}>{option.label}</button
					>
				{/each}
				<button
					type="button"
					class="link-button danger"
					onmousedown={(event) => event.preventDefault()}
					onclick={deleteFromEditor}>{m.line_delete()}</button
				>
			</div>
		{/if}
	{:else if scalable && quantityDraft?.index === index}
		<form
			class="quantity-form"
			onsubmit={(event) => {
				event.preventDefault();
				applyQuantity();
			}}
		>
			<input
				class="quantity-input"
				type="text"
				inputmode="decimal"
				aria-label={m.scale_quantity_label()}
				value={quantityDraft.text}
				oninput={(event) => setQuantityText(event.currentTarget.value)}
			/>
			<button type="submit" class="link-button">{m.scale_apply()}</button>
			<button type="button" class="link-button" onclick={() => (quantityDraft = null)}
				>{m.scale_cancel()}</button
			>
		</form>
	{:else if scalable && scaleOpen && hasAmount(text)}
		<button type="button" class="editable" onclick={() => startQuantity(index)}>{display}</button>
	{:else if canEdit}
		<button type="button" class="editable" onclick={() => startInline(part, index, text, note)}>
			{#if rich}<RichText source={display} />{:else}{display}{/if}
		</button>
	{:else if rich}
		<RichText source={display} />
	{:else}
		{display}
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
			{#if editMode}
				<p class="action-row">
					<button type="button" class="action-button" onclick={leaveEdit}>{m.edit_done()}</button>
				</p>
			{:else}
				<div class="action-row">
					{#if shown.steps.length > 0}
						<a class="action-button" href={resolve('/recipes/[id]/cook', { id: recipe.id })}
							>{m.cook_open()}</a
						>
					{/if}
					{#if page.data.signedIn}
						<button type="button" class="action-button" onclick={addToShopping}
							>{m.shopping_add()}</button
						>
					{/if}
					<details class="more-menu">
						<summary class="action-button secondary">{m.more_open()}</summary>
						<div class="more-panel">
							{#if page.data.signedIn}
								<button
									type="button"
									class="menu-item"
									onclick={(event) => {
										closeMore(event);
										editMode = true;
									}}>{m.edit_recipe()}</button
								>
							{/if}
							{#if translated && !translated.failed}
								<button
									type="button"
									class="menu-item"
									onclick={(event) => {
										closeMore(event);
										showOriginal = !showOriginal;
									}}>{showOriginal ? m.show_translation() : m.show_original()}</button
								>
							{/if}
							{#if override && page.data.signedIn}
								<button
									type="button"
									class="menu-item"
									onclick={(event) => {
										closeMore(event);
										resetEdits();
									}}>{m.translation_reset()}</button
								>
							{/if}
							<button
								type="button"
								class="menu-item"
								onclick={(event) => {
									closeMore(event);
									sharing = !sharing;
								}}>{m.share_open()}</button
							>
							<button
								type="button"
								class="menu-item"
								onclick={(event) => {
									closeMore(event);
									scaleOpen = !scaleOpen;
								}}>{m.scale_open()}</button
							>
							{#if page.data.signedIn}
								<button
									type="button"
									class="menu-item"
									onclick={(event) => {
										closeMore(event);
										startSourceEdit();
									}}>{recipe.sourceUrl ? m.source_change() : m.source_add()}</button
								>
								<button
									type="button"
									class="menu-item"
									onclick={(event) => {
										closeMore(event);
										toggleArchive();
									}}>{recipe.archived ? m.restore_action() : m.archive_action()}</button
								>
							{/if}
							{#if recipe.archived && page.data.signedIn}
								<button
									type="button"
									class="menu-item danger"
									onclick={(event) => {
										closeMore(event);
										deleteThis();
									}}>{m.delete_action()}</button
								>
							{/if}
						</div>
					</details>
				</div>
			{/if}
			{#if recipe.sourceUrl}
				<p class="source-line">
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
				</p>
			{/if}
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
				<h2>
					{m.recipe_ingredients_heading()}{#if override && !translating && recipe && isLanguage(locale)}
						<span class="edited-tag">{m.translation_edited_note()}</span>{/if}
				</h2>
				{#if !translating && recipe && isLanguage(locale)}
					<div class="translation-tools">
						{#if showOriginal && page.data.signedIn}<p class="meta tools-status">
								{m.original_edit_note()}
							</p>{/if}
						{#if translationMisaligned}
							<p role="status">{m.translation_misaligned()}</p>
						{:else if translationStale}
							<p role="status">{m.translation_stale()}</p>
						{/if}
						{#if translationError}
							<p role="alert">{translationError}</p>
						{/if}
					</div>
				{/if}
				{#if sharing && recipe && shown}
					<ShareRecipe
						{recipe}
						fields={shown}
						translateFailed={translated?.failed === true}
						{photos}
						locale={isLanguage(locale) ? locale : 'en'}
					/>
				{/if}
				{#if recipe.images.length > 0 || (editMode && page.data.signedIn)}
					<div class="gallery stacked">
						{#each photos as photo (photo.id)}
							<figure class="gallery-item">
								<img class="preview" src={photo.url} alt={m.recipe_screenshot_alt()} />
								{#if editMode && page.data.signedIn}
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
												class="link-button"
												onclick={() => {
													openPhoto = null;
													showAddPhotos = true;
												}}>{m.photo_add_more()}</button
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
					{#if editMode && page.data.signedIn}
						{#if showAddPhotos}
							<PhotoButtons
								disabled={photoBusy}
								onfiles={addPhotos}
								onerror={(key) => (photoError = key)}
							/>
							<button type="button" class="link-button" onclick={() => (showAddPhotos = false)}
								>{m.recipe_cancel()}</button
							>
						{:else if photos.length === 0}
							<button type="button" class="link-button" onclick={() => (showAddPhotos = true)}
								>{m.photo_add_first()}</button
							>
						{/if}
					{/if}
					{#if photoError}
						<p role="alert">{photoErrorMessages[photoError]()}</p>
					{/if}
				{/if}
				{#if editMode}
					<p class="meta">
						{m.ingredients_source()}: {sourceLabels[recipe.source]()}
					</p>
				{/if}
				{#if scaleOpen || scale !== 1}
					<p class="tools-links scale-tools">
						<button
							type="button"
							class="link-button"
							aria-expanded={scaleOpen}
							onclick={() => {
								scaleOpen = !scaleOpen;
								quantityDraft = null;
							}}>{m.scale_open()}</button
						>
						{#if scale !== 1}
							<button
								type="button"
								class="link-button"
								onclick={() => {
									scale = 1;
									quantityDraft = null;
								}}>{m.scale_reset()}</button
							>
						{/if}
						{#if scaleOpen}
							{#each scaleSteps as step (step.factor)}
								<button
									type="button"
									class="link-button"
									aria-pressed={scale === step.factor}
									onclick={() => (scale = step.factor)}>{step.label}</button
								>
							{/each}
						{/if}
					</p>
				{/if}
				{#if shown.ingredients.length === 0}{@render addSlot('ingredients', 0)}{/if}
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
									{#if entry.item !== null}{#if iconFor(entry.item.text)}<span
												class="item-icon"
												aria-hidden="true">{iconFor(entry.item.text)}</span
											>{/if}{@render lineEdit(
											'ingredients',
											entry.item.index,
											entry.item.text,
											false,
											false,
											scaleLine(entry.item.text, scale),
											true
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
			</section>

			{#if shown.steps.length > 0 || (editMode && page.data.signedIn)}
				<section>
					<h2>{m.recipe_steps_heading()}</h2>
					{#if stepGroups.length === 0}{@render addSlot('steps', 0)}{/if}
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
								hidden={!(editMode && page.data.signedIn)}
								aria-label={m.tag_remove({ tag: tagNames.label(tag) })}
								onclick={() => removeTag(tag)}>×</button
							>
						</span>
					{/each}
				</div>
				{#if editMode && page.data.signedIn}
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
