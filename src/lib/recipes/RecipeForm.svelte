<script lang="ts">
	import { tick } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import {
		hasErrors,
		mergeIngredientLines,
		parseLines,
		validateRecipeInput,
		type IngredientSource,
		type RecipeErrorKey,
		type RecipeErrors,
		type RecipeInput
	} from '#lib/recipes/recipe.js';
	import type { ImportErrorKey } from '#lib/recipes/import.js';

	let {
		initial,
		initialSource = 'typed',
		submitLabel,
		cancelHref,
		hasSavedImage = false,
		onsave
	}: {
		/** Starting values. Read once when the form mounts. */
		initial: RecipeInput;
		initialSource?: IngredientSource;
		submitLabel: string;
		/** Where Cancel goes. Already resolved by the caller. */
		cancelHref: string;
		/** True when the recipe already has a screenshot saved with it. */
		hasSavedImage?: boolean;
		/** Called with valid input, the ingredient source, and a new screenshot (or null). */
		onsave: (input: RecipeInput, source: IngredientSource, image: File | null) => void;
	} = $props();

	// The form edits its own copies of the starting values, read once on mount.
	// svelte-ignore state_referenced_locally
	let input = $state<RecipeInput>({ ...initial });
	// svelte-ignore state_referenced_locally
	let rows = $state<string[]>(
		parseLines(initial.ingredients).length ? parseLines(initial.ingredients) : ['']
	);
	// svelte-ignore state_referenced_locally
	let source = $state<IngredientSource>(initialSource);
	let readImage = $state(true);
	let pending = $state<{ lines: string[]; source: IngredientSource } | null>(null);

	let errors = $state<RecipeErrors>({});
	let importing = $state(false);
	let importError = $state<ImportErrorKey | null>(null);
	let stepsField: HTMLTextAreaElement | undefined = $state();
	let scanning = $state(false);
	let scanError = $state<string | null>(null);
	let image = $state<File | null>(null);

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

	const scanErrorMessages: Record<string, () => string> = {
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

	/** The non-empty ingredient lines, as they will be saved. */
	function currentLines(): string[] {
		return rows.map((r) => r.trim()).filter((r) => r.length > 0);
	}

	/**
	 * Puts new ingredient lines into the list. An empty list takes them straight away;
	 * a non-empty one asks whether to add to it or replace it.
	 */
	function offerLines(lines: string[], next: IngredientSource) {
		if (lines.length === 0) return;
		if (currentLines().length === 0) {
			rows = [...lines];
			source = next;
			return;
		}
		pending = { lines, source: next };
	}

	function resolvePending(mode: 'merge' | 'replace') {
		if (!pending) return;
		const next =
			mode === 'replace' ? pending.lines : mergeIngredientLines(currentLines(), pending.lines);
		rows = next.length > 0 ? next : [''];
		source = pending.source;
		pending = null;
	}

	function addRow() {
		rows = [...rows, ''];
	}

	function removeRow(index: number) {
		rows = rows.filter((_, i) => i !== index);
		if (rows.length === 0) rows = [''];
	}

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
			if (input.steps.trim().length === 0) input.steps = body.steps.join('\n');
			offerLines(body.ingredients, 'web');
		} catch {
			importError = 'page_unreachable';
		} finally {
			importing = false;
		}
	}

	/** Chosen with the file picker. */
	function onFilePicked(event: Event) {
		const fileInput = event.currentTarget as HTMLInputElement;
		const file = fileInput.files?.[0];
		if (file) attach(file);
		fileInput.value = '';
	}

	/** An image on the clipboard (a Mac screenshot, for example) is attached like a picked file. */
	function onPaste(event: ClipboardEvent) {
		const item = Array.from(event.clipboardData?.items ?? []).find(
			(i) => i.kind === 'file' && i.type.startsWith('image/')
		);
		const file = item?.getAsFile();
		if (!file) return; // plain text pastes behave as normal
		event.preventDefault();
		attach(file);
	}

	/**
	 * Attaches the image as the original file and makes it the ingredient source.
	 * With reading switched on, its text lines are offered for the list as well.
	 */
	function attach(file: File) {
		image = file;
		source = 'image';
		if (readImage) scanScreenshot(file);
	}

	function removeImage() {
		image = null;
		if (source === 'image') source = 'typed';
	}

	async function scanScreenshot(file: File) {
		scanError = null;
		scanning = true;
		try {
			const body = new FormData();
			body.append('image', file);
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
		onsave({ ...input, ingredients: currentLines().join('\n') }, source, image);
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

	<div>
		<button type="button" onclick={importFromUrl} disabled={importing}>
			{importing ? m.import_importing() : m.import_button()}
		</button>
		<small>{m.import_hint()}</small>
	</div>
	{#if importError}
		<p role="alert">{importErrorMessages[importError]()}</p>
	{/if}

	<fieldset class="ingredients">
		<legend>{m.recipe_field_ingredients()}</legend>
		<p class="meta">{m.ingredients_source()}: {sourceLabels[source]()}</p>

		{#each rows, i (i)}
			<div class="ingredient-row">
				<input type="text" bind:value={rows[i]} aria-label={m.ingredient_label({ n: i + 1 })} />
				<button type="button" class="link-button" onclick={() => removeRow(i)}>
					{m.ingredient_remove()}
				</button>
			</div>
		{/each}
		<button type="button" class="add-row" onclick={addRow}>{m.ingredient_add()}</button>

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
	</fieldset>

	<div class="screenshot-field">
		<label class="file-button" class:busy={scanning}>
			{scanning ? m.ocr_scanning() : m.ocr_label()}
			<input
				type="file"
				accept="image/png,image/jpeg"
				disabled={scanning}
				onchange={onFilePicked}
			/>
		</label>
		<label class="checkbox">
			<input type="checkbox" bind:checked={readImage} />
			{m.image_read_option()}
		</label>
		<small>{m.ocr_hint()}</small>
		{#if image}
			<p class="attached">
				<span>{m.image_attached()}: {image.name}</span>
				<button type="button" class="link-button" onclick={removeImage}>{m.image_remove()}</button>
			</p>
		{:else if hasSavedImage}
			<p class="meta">{m.image_saved_note()}</p>
		{/if}
	</div>
	{#if scanError}
		<p role="alert">{scanErrorMessages[scanError]?.() ?? m.error_ocr_failed()}</p>
	{/if}

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
		<button type="submit">{submitLabel}</button>
		<!-- cancelHref is resolved by the caller. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={cancelHref}>{m.recipe_cancel()}</a>
	</div>
</form>
