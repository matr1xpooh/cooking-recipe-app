<script lang="ts">
	import { tick } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import {
		hasErrors,
		mergeIngredientLines,
		MAX_TAGS_PER_RECIPE,
		TAGS,
		type Tag,
		normalizeTag,
		validateRecipeInput,
		type IngredientSource,
		type RecipeErrorKey,
		type RecipeErrors,
		type RecipeInput
	} from '#lib/recipes/recipe.js';
	import type { ImportErrorKey } from '#lib/recipes/import.js';
	import { loadImage } from '#lib/recipes/image-store.js';
	import { resolve } from '$app/paths';
	import { fetchPicture } from '#lib/recipes/recipe-api.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import { TagNames } from '#lib/recipes/tag-names.svelte.js';
	import { suggestTags } from '#lib/recipes/tag-suggest.js';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		initial,
		initialSource = 'typed',
		submitLabel,
		cancelHref,
		savedImageIds = [],
		ownId,
		onsave
	}: {
		/** Starting values. Read once when the form mounts. */
		initial: RecipeInput;
		initialSource?: IngredientSource;
		submitLabel: string;
		/** Where Cancel goes. Already resolved by the caller. */
		cancelHref: string;
		/** Ids of the images already saved with the recipe, in order. */
		savedImageIds?: string[];
		/** The id of the recipe being edited: its saved images are loaded from it, and it is not reported as its own duplicate. */
		ownId?: string;
		/**
		 * Called with valid input and the ingredient source, the images added in this form
		 * (to upload), and the ids of the saved images to keep (the rest are removed).
		 */
		onsave: (
			input: RecipeInput,
			source: IngredientSource,
			newImages: File[],
			keptImageIds: string[]
		) => void;
	} = $props();

	// The form edits its own copies of the starting values, read once on mount.
	// svelte-ignore state_referenced_locally
	let input = $state<RecipeInput>({ ...initial });

	/** Built-in tags, then every custom tag already used on any recipe. */
	const vocabulary = $derived([
		...TAGS,
		...[...new Set([...recipeStore.recipes.flatMap((r) => r.tags), ...input.tags])]
			.filter((tag) => !(TAGS as readonly string[]).includes(tag))
			.sort()
	]);

	const tagNames = new TagNames();

	$effect(() => {
		tagNames.ensure(vocabulary);
	});

	let newTag = $state('');
	let tagError = $state<string | null>(null);

	/** Adds the typed tag to this recipe. It then appears for every recipe. */
	function addTypedTag() {
		const tag = normalizeTag(newTag);
		newTag = '';
		tagError = null;
		if (!tag || input.tags.includes(tag)) return;
		if (input.tags.length >= MAX_TAGS_PER_RECIPE) {
			tagError = 'tags_limit';
			return;
		}
		input.tags = [...input.tags, tag];
	}

	function toggleTag(tag: Tag) {
		input.tags = input.tags.includes(tag)
			? input.tags.filter((t) => t !== tag)
			: [...input.tags, tag];
	}

	// svelte-ignore state_referenced_locally
	let text = $state(initial.ingredients);
	/** Tags the user can see as suggestions: words in the recipe that point to a tag. */
	const suggested = $derived<Tag[]>(
		suggestTags([input.title, text, input.steps].join('\n')).filter(
			(tag) => !input.tags.includes(tag)
		)
	);
	// svelte-ignore state_referenced_locally
	let source = $state<IngredientSource>(initialSource);
	let tab = $state<'text' | 'image'>('text');
	let pending = $state<{ lines: string[]; source: IngredientSource } | null>(null);

	let errors = $state<RecipeErrors>({});
	let importing = $state(false);
	let importError = $state<ImportErrorKey | null>(null);
	/** The saved recipe with this page's address, when there is one. */
	let duplicate = $state<{ id: string; title: string } | null>(null);
	let stepsField: HTMLTextAreaElement | undefined = $state();
	let scanning = $state(false);
	let scanError = $state<string | null>(null);

	/** Saved images still on the recipe. Removing one here removes it on save. */
	// svelte-ignore state_referenced_locally
	let keptIds = $state<string[]>([...savedImageIds]);
	/** Images added in this form. Uploaded on save. */
	let newFiles = $state<File[]>([]);
	/** Display addresses for the saved and new images. */
	let savedUrls = $state<Record<string, string>>({});
	let newUrls = $state<string[]>([]);

	const styleColors = [
		{ key: 'red', label: () => m.color_red() },
		{ key: 'orange', label: () => m.color_orange() },
		{ key: 'green', label: () => m.color_green() },
		{ key: 'blue', label: () => m.color_blue() },
		{ key: 'purple', label: () => m.color_purple() }
	] as const;

	const errorMessages: Record<RecipeErrorKey, () => string> = {
		title_required: () => m.error_title_required(),
		source_url_invalid: () => m.error_source_url_invalid(),
		start_invalid: () => m.error_start_invalid()
	};

	const importErrorMessages: Record<ImportErrorKey, () => string> = {
		url_invalid: () => m.error_source_url_invalid(),
		url_not_allowed: () => m.import_error_url_not_allowed(),
		page_unreachable: () => m.import_error_page_unreachable(),
		page_too_large: () => m.import_error_page_too_large(),
		no_recipe_found: () => m.import_error_no_recipe_found(),
		description_not_parsed: () => m.import_error_description_not_parsed()
	};

	const scanErrorMessages: Record<string, () => string> = {
		clipboard_unavailable: () => m.error_clipboard_unavailable(),
		clipboard_denied: () => m.error_clipboard_denied(),
		no_image_on_clipboard: () => m.error_no_image_on_clipboard(),
		image_invalid: () => m.error_image_invalid(),
		image_too_large: () => m.error_image_too_large(),
		no_text_found: () => m.error_no_text_found(),
		ocr_failed: () => m.error_ocr_failed()
	};

	const sourceLabels: Record<IngredientSource, () => string> = {
		typed: () => m.source_typed(),
		web: () => m.source_web(),
		image: () => m.source_image()
	};

	// Saved images: load each one for display, once.
	const loadedSaved = new SvelteSet<string>();
	$effect(() => {
		if (!ownId) return;
		for (const id of keptIds) {
			if (loadedSaved.has(id)) continue;
			loadedSaved.add(id);
			loadImage(ownId, id).then((blob) => {
				if (blob) savedUrls = { ...savedUrls, [id]: URL.createObjectURL(blob) };
			});
		}
	});

	// New images: a display address for each, released when the list changes.
	$effect(() => {
		const urls = newFiles.map((file) => URL.createObjectURL(file));
		newUrls = urls;
		return () => urls.forEach((url) => URL.revokeObjectURL(url));
	});

	/** Everything shown in the Image tab, saved images first. */
	const gallery = $derived([
		...keptIds.map((id) => ({
			key: `saved-${id}`,
			src: savedUrls[id] ?? '',
			saved: true,
			id,
			index: 0
		})),
		...newFiles.map((_, index) => ({
			key: `new-${index}`,
			src: newUrls[index] ?? '',
			saved: false,
			id: '',
			index
		}))
	]);

	/** The non-empty ingredient lines, as they will be saved. */
	function currentLines(): string[] {
		return text
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}

	/**
	 * Puts new ingredient lines into the text. An empty list takes them straight away;
	 * a non-empty one asks whether to add to it or replace it.
	 */
	function offerLines(lines: string[], next: IngredientSource) {
		if (lines.length === 0) return;
		tab = 'text';
		if (currentLines().length === 0) {
			text = lines.join('\n');
			source = next;
			return;
		}
		pending = { lines, source: next };
	}

	function resolvePending(mode: 'merge' | 'replace') {
		if (!pending) return;
		const next =
			mode === 'replace' ? pending.lines : mergeIngredientLines(currentLines(), pending.lines);
		text = next.join('\n');
		source = pending.source;
		pending = null;
	}

	/** Fills empty fields from the source page's recipe data. Typed values are kept. */
	async function importFromUrl() {
		importError = null;
		duplicate = null;
		const target = input.sourceUrl.trim();
		if (target.length === 0) {
			importError = 'url_invalid';
			return;
		}

		importing = true;
		try {
			const query = [
				`url=${encodeURIComponent(target)}`,
				`start=${encodeURIComponent(input.sourceStart.trim())}`
			];
			if (ownId) query.push(`exceptId=${encodeURIComponent(ownId)}`);
			const res = await fetch(`/api/recipes/import?${query.join('&')}`);
			const body = await res.json();
			if (res.status === 409) {
				duplicate = body.existing;
				return;
			}
			if (!res.ok) {
				importError = body.error ?? 'page_unreachable';
				return;
			}
			if (input.title.trim().length === 0) input.title = body.title;
			if (input.steps.trim().length === 0) input.steps = body.steps.join('\n');
			offerLines(body.ingredients, 'web');
			// The recipe's picture, added as one more image.
			if (body.imageUrl) {
				const picture = await fetchPicture(body.imageUrl);
				if (picture)
					newFiles = [...newFiles, new File([picture], 'picture', { type: picture.type })];
			}
		} catch {
			importError = 'page_unreachable';
		} finally {
			importing = false;
		}
	}

	/** Chosen with the file picker; several may be chosen at once. */
	function onFilePicked(event: Event) {
		const fileInput = event.currentTarget as HTMLInputElement;
		const files = Array.from(fileInput.files ?? []);
		if (files.length > 0) addImages(files);
		fileInput.value = '';
	}

	/** An image on the clipboard (a Mac screenshot, for example) is added like a picked file. */
	function onPaste(event: ClipboardEvent) {
		const item = Array.from(event.clipboardData?.items ?? []).find(
			(i) => i.kind === 'file' && i.type.startsWith('image/')
		);
		const file = item?.getAsFile();
		if (!file) return; // plain text pastes behave as normal
		event.preventDefault();
		addImages([file]);
	}

	/** Adds images to the gallery. Their text is read only when asked for. */
	function addImages(files: File[]) {
		newFiles = [...newFiles, ...files];
		tab = 'image';
		scanError = null;
	}

	function removeGalleryItem(item: { saved: boolean; id: string; index: number }) {
		if (item.saved) keptIds = keptIds.filter((id) => id !== item.id);
		else newFiles = newFiles.filter((_, i) => i !== item.index);
	}

	/**
	 * Reads an image straight from the clipboard. This is the reliable route for a
	 * screenshot; the file button opens the file picker instead.
	 */
	async function pasteFromClipboard() {
		scanError = null;
		if (!navigator.clipboard?.read) {
			scanError = 'clipboard_unavailable';
			return;
		}
		try {
			for (const item of await navigator.clipboard.read()) {
				const type = item.types.find((t) => t === 'image/png' || t === 'image/jpeg');
				if (!type) continue;
				const blob = await item.getType(type);
				const extension = type === 'image/png' ? 'png' : 'jpg';
				addImages([new File([blob], `clipboard.${extension}`, { type })]);
				return;
			}
			scanError = 'no_image_on_clipboard';
		} catch {
			scanError = 'clipboard_denied';
		}
	}

	/** The bytes of one gallery image, saved or new. */
	async function blobOf(item: { saved: boolean; id: string; index: number }): Promise<Blob | null> {
		if (!item.saved) return newFiles[item.index] ?? null;
		return ownId ? loadImage(ownId, item.id) : null;
	}

	/** Reads the text lines from one image and offers them for the text box. */
	async function readText(item: { saved: boolean; id: string; index: number }) {
		const blob = await blobOf(item);
		if (!blob) return;
		scanError = null;
		scanning = true;
		try {
			const body = new FormData();
			body.append('image', blob, 'image.png');
			const res = await fetch('/api/recipes/ocr', { method: 'POST', body });
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				scanError = data?.error ?? 'ocr_failed';
				return;
			}
			const lines: string[] = Array.isArray(data?.ingredients) ? data.ingredients : [];
			offerLines(lines, 'image');
		} catch {
			scanError = 'ocr_failed';
		} finally {
			scanning = false;
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
		onsave({ ...input, ingredients: currentLines().join('\n') }, source, newFiles, keptIds);
	}
</script>

<form onsubmit={submit} onpaste={onPaste} novalidate>
	<label>
		{m.recipe_field_title()}
		<input type="text" bind:value={input.title} aria-invalid={errors.title ? 'true' : undefined} />
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
		{m.recipe_field_start()}
		<input
			type="text"
			inputmode="numeric"
			placeholder="4:30"
			bind:value={input.sourceStart}
			aria-invalid={errors.sourceStart ? 'true' : undefined}
		/>
		<small>{m.recipe_start_hint()}</small>
	</label>
	{#if errors.sourceStart}
		<p role="alert">{errorMessages[errors.sourceStart]()}</p>
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
	{#if duplicate}
		<p role="alert">
			{m.error_duplicate()}
			<a href={resolve('/recipes/[id]', { id: duplicate.id })}>{duplicate.title}</a>
		</p>
	{/if}

	<div class="ingredients-block">
		<span class="field-label">{m.recipe_field_ingredients()}</span>
		<div class="tabs" role="tablist" aria-label={m.recipe_field_ingredients()}>
			<button
				type="button"
				role="tab"
				id="tab-text"
				class="tab"
				class:active={tab === 'text'}
				aria-selected={tab === 'text'}
				aria-controls="panel-text"
				onclick={() => (tab = 'text')}>{m.tab_text()}</button
			>
			<button
				type="button"
				role="tab"
				id="tab-image"
				class="tab"
				class:active={tab === 'image'}
				aria-selected={tab === 'image'}
				aria-controls="panel-image"
				onclick={() => (tab = 'image')}>{m.tab_image()}</button
			>
		</div>

		{#if tab === 'text'}
			<div role="tabpanel" id="panel-text" aria-labelledby="tab-text" class="tabpanel">
				<textarea rows="8" aria-label={m.recipe_field_ingredients()} bind:value={text}></textarea>
				<small>{m.ingredients_hint()}</small>
				<p class="meta">{m.ingredients_source()}: {sourceLabels[source]()}</p>

				{#if pending}
					<div class="merge-panel" role="group" aria-label={m.ingredients_conflict()}>
						<p>{m.ingredients_conflict()}</p>
						<div class="merge-actions">
							<button type="button" onclick={() => resolvePending('merge')}
								>{m.ingredients_merge()}</button
							>
							<button type="button" onclick={() => resolvePending('replace')}>
								{m.ingredients_replace()}
							</button>
							<button type="button" class="link-button" onclick={() => (pending = null)}>
								{m.recipe_cancel()}
							</button>
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<div role="tabpanel" id="panel-image" aria-labelledby="tab-image" class="tabpanel">
				{#if gallery.length === 0}
					<p class="meta">{m.image_empty()}</p>
				{:else}
					<div class="gallery">
						{#each gallery as item (item.key)}
							<figure class="gallery-item">
								{#if item.src}
									<img src={item.src} alt={m.recipe_screenshot_alt()} />
								{/if}
								<figcaption class="image-actions">
									<button
										type="button"
										class="link-button"
										disabled={scanning}
										onclick={() => readText(item)}>{m.image_read_text()}</button
									>
									<button
										type="button"
										class="link-button danger"
										onclick={() => removeGalleryItem(item)}>{m.image_remove()}</button
									>
								</figcaption>
							</figure>
						{/each}
					</div>
				{/if}

				<div class="image-actions">
					<label class="file-button" class:busy={scanning}>
						{m.ocr_label()}
						<input
							type="file"
							accept="image/png,image/jpeg"
							multiple
							disabled={scanning}
							onchange={onFilePicked}
						/>
					</label>
					<button
						type="button"
						class="file-button"
						onclick={pasteFromClipboard}
						disabled={scanning}
					>
						{m.clipboard_button()}
					</button>
				</div>
			</div>
		{/if}

		{#if scanError}
			<p role="alert">{scanErrorMessages[scanError]?.() ?? m.error_ocr_failed()}</p>
		{/if}
	</div>

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

	<fieldset class="tags-field">
		<legend>{m.recipe_field_tags()}</legend>
		<p class="meta">{m.tags_hint()}</p>
		<div class="tag-chips">
			{#each vocabulary as tag (tag)}
				{@const on = input.tags.includes(tag)}
				<button
					type="button"
					class="tag"
					class:on
					class:suggested={!on && suggested.includes(tag)}
					aria-pressed={on}
					onclick={() => toggleTag(tag)}>{tagNames.label(tag)}</button
				>
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
						addTypedTag();
					}
				}}
			/>
			<button type="button" class="link-button" onclick={addTypedTag}>{m.tags_add_button()}</button>
		</div>
		{#if tagError}
			<p role="alert">{m.tags_limit({ n: MAX_TAGS_PER_RECIPE })}</p>
		{/if}
	</fieldset>

	<div>
		<button type="submit">{submitLabel}</button>
		<!-- cancelHref is resolved by the caller. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={cancelHref}>{m.recipe_cancel()}</a>
	</div>
</form>
