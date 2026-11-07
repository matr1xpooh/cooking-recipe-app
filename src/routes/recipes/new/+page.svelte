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
	import { LANGUAGES, LANGUAGE_NAMES, isLanguage, type Language } from '#lib/recipes/languages.js';

	let input = $state<RecipeInput>({
		title: '',
		sourceUrl: '',
		ingredients: '',
		steps: '',
		notes: ''
	});
	let errors = $state<RecipeErrors>({});
	let importing = $state(false);
	let importError = $state<ImportErrorKey | null>(null);
	let notesField: HTMLTextAreaElement | undefined = $state();

	// Language: auto-detected from the recipe text until the user picks one.
	let language = $state<Language | ''>('');
	let languageManual = $state(false);
	let detecting = $state(false);
	let languageError = $state(false);

	// Saving: translation of the notes happens here, so it can fail.
	let saving = $state(false);
	let translateError = $state<string | null>(null);

	// Load saved recipes first: saving writes the whole list back to storage.
	onMount(() => recipeStore.load());

	const noteColors = [
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

	const translateErrorMessages: Record<string, () => string> = {
		text_too_long: () => m.error_notes_too_long(),
		language_unsupported: () => m.error_language_required(),
		translate_failed: () => m.error_translate_failed()
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
			await detectLanguage();
		} catch {
			importError = 'page_unreachable';
		} finally {
			importing = false;
		}
	}

	/**
	 * Detects the recipe language from its title, ingredients and steps. Does nothing
	 * once the user has picked a language. Returns the detected language, if any.
	 */
	async function detectLanguage(): Promise<Language | null> {
		if (languageManual) return language || null;
		const text = [input.title, input.ingredients, input.steps].join('\n').trim();
		if (text.length === 0) return null;

		detecting = true;
		try {
			const res = await fetch('/api/recipes/detect-language', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text })
			});
			const body = await res.json();
			if (res.ok && isLanguage(body.language)) {
				language = body.language;
				languageError = false;
				return body.language;
			}
			language = '';
			return null;
		} catch {
			language = '';
			return null;
		} finally {
			detecting = false;
		}
	}

	function pickLanguage(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		languageManual = true;
		languageError = false;
		language = isLanguage(value) ? value : '';
	}

	/** Wraps the selected notes text in markup markers, keeping the selection. */
	async function wrapNotes(open: string, close: string) {
		const el = notesField;
		if (!el) return;
		const { selectionStart: start, selectionEnd: end, value } = el;
		const selected = value.slice(start, end);
		input.notes = value.slice(0, start) + open + selected + close + value.slice(end);
		await tick();
		el.focus();
		el.setSelectionRange(start + open.length, start + open.length + selected.length);
	}

	/** Translates the English notes into `target`. Returns null on failure, with translateError set. */
	async function translateNotesFor(target: Language): Promise<string | null> {
		if (input.notes.trim().length === 0 || target === 'en') return null;
		const res = await fetch('/api/recipes/translate-notes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ notes: input.notes, target })
		});
		const body = await res.json().catch(() => null);
		if (!res.ok || typeof body?.notes !== 'string') {
			translateError = body?.error ?? 'translate_failed';
			return null;
		}
		return body.notes;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		errors = validateRecipeInput(input);
		if (hasErrors(errors)) return;

		saving = true;
		translateError = null;
		try {
			const chosen = language || (await detectLanguage());
			if (!chosen) {
				languageError = true;
				return;
			}
			const notesTranslated = await translateNotesFor(chosen);
			if (translateError) return;

			recipeStore.add(
				createRecipe(input, {
					id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
					createdAt: new Date(),
					language: chosen,
					notesTranslated
				})
			);
			goto(resolve('/recipes'));
		} finally {
			saving = false;
		}
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
				onblur={detectLanguage}
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
			<textarea rows="6" bind:value={input.ingredients} onblur={detectLanguage}></textarea>
		</label>

		<label>
			{m.recipe_field_steps()}
			<textarea rows="8" bind:value={input.steps} onblur={detectLanguage}></textarea>
		</label>

		<div class="language-field">
			<label>
				{m.language_label()}
				<select value={language} onchange={pickLanguage} aria-describedby="language-status">
					<option value="" disabled>{m.language_choose()}</option>
					{#each LANGUAGES as code (code)}
						<option value={code}>{LANGUAGE_NAMES[code]}</option>
					{/each}
				</select>
			</label>
			<small id="language-status">
				{#if detecting}
					{m.language_detecting()}
				{:else if languageManual}
					{m.language_manual()}
				{:else if language}
					{m.language_auto()}
				{/if}
			</small>
		</div>
		{#if languageError}
			<p role="alert">{m.error_language_required()}</p>
		{/if}

		<div class="notes-field">
			<span class="field-label">{m.notes_label()}</span>
			<div class="toolbar" role="toolbar" aria-label={m.notes_label()}>
				<button type="button" onclick={() => wrapNotes('**', '**')} aria-label={m.notes_bold()}>
					<strong>B</strong>
				</button>
				<button type="button" onclick={() => wrapNotes('*', '*')} aria-label={m.notes_italic()}>
					<em>I</em>
				</button>
				{#each noteColors as color (color.key)}
					<button
						type="button"
						class="swatch note-{color.key}"
						onclick={() => wrapNotes(`[${color.key}]`, `[/${color.key}]`)}
						aria-label={color.label()}
					>
						{color.label()}
					</button>
				{/each}
			</div>
			<textarea
				rows="6"
				aria-label={m.notes_label()}
				bind:this={notesField}
				bind:value={input.notes}></textarea>
			<small>{m.notes_hint()}</small>
		</div>
		{#if translateError}
			<p role="alert">
				{(translateErrorMessages[translateError] ?? translateErrorMessages.translate_failed)()}
			</p>
		{/if}

		<div>
			<button type="submit" disabled={saving}>
				{saving ? m.notes_translating() : m.recipe_save()}
			</button>
			<a href={resolve('/recipes')}>{m.recipe_cancel()}</a>
		</div>
	</form>
</main>
