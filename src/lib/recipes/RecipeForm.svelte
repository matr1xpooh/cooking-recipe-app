<script lang="ts">
	import { tick } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import {
		hasErrors,
		validateRecipeInput,
		type RecipeErrorKey,
		type RecipeErrors,
		type RecipeInput
	} from '#lib/recipes/recipe.js';
	import type { ImportErrorKey } from '#lib/recipes/import.js';

	let {
		initial,
		submitLabel,
		cancelHref,
		onsave
	}: {
		/** Starting values. Read once when the form mounts. */
		initial: RecipeInput;
		submitLabel: string;
		/** Where Cancel goes. Already resolved by the caller. */
		cancelHref: string;
		/** Called with valid input when the form is submitted. */
		onsave: (input: RecipeInput) => void;
	} = $props();

	// Copied once on mount: the form edits its own copy, not the prop.
	// svelte-ignore state_referenced_locally
	let input = $state<RecipeInput>({ ...initial });
	let errors = $state<RecipeErrors>({});
	let importing = $state(false);
	let importError = $state<ImportErrorKey | null>(null);
	let stepsField: HTMLTextAreaElement | undefined = $state();
	let scanning = $state(false);
	let scanError = $state<string | null>(null);

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

	const scanErrorMessages: Record<string, () => string> = {
		image_invalid: () => m.error_image_invalid(),
		image_too_large: () => m.error_image_too_large(),
		no_text_found: () => m.error_no_text_found(),
		ocr_failed: () => m.error_ocr_failed()
	};

	/** Reads ingredient lines from an uploaded screenshot and adds them below the typed ones. */
	async function addFromScreenshot(event: Event) {
		const fileInput = event.currentTarget as HTMLInputElement;
		const file = fileInput.files?.[0];
		if (!file) return;

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
			// Skip lines already in the box, so uploading the same screenshot twice adds nothing.
			const existing = new Set(input.ingredients.split('\n').map((l) => l.trim().toLowerCase()));
			const added = lines.filter((l) => !existing.has(l.trim().toLowerCase()));
			input.ingredients = [input.ingredients.trimEnd(), ...added]
				.filter((l) => l.length > 0)
				.join('\n');
		} catch {
			scanError = 'ocr_failed';
		} finally {
			scanning = false;
			fileInput.value = '';
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
		onsave({ ...input });
	}
</script>

<form onsubmit={submit} novalidate>
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

	<label>
		{m.recipe_field_ingredients()}
		<textarea rows="6" bind:value={input.ingredients}></textarea>
	</label>

	<div class="screenshot-field">
		<label class="file-button" class:busy={scanning}>
			{scanning ? m.ocr_scanning() : m.ocr_label()}
			<input
				type="file"
				accept="image/png,image/jpeg"
				disabled={scanning}
				onchange={addFromScreenshot}
			/>
		</label>
		<small>{m.ocr_hint()}</small>
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
