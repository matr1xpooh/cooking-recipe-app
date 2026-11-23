<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { LANGUAGES, LANGUAGE_NAMES, type Language } from '#lib/recipes/languages.js';
	import { loadDisplay, shownFields } from '#lib/recipes/display.js';
	import { sourceHref, type Recipe } from '#lib/recipes/recipe.js';
	import { recipeToText } from '#lib/recipes/share-text.js';

	interface Props {
		recipe: Recipe;
		photos: { id: string; url: string }[];
		locale: Language;
		signedIn: boolean;
	}

	let { recipe, photos, locale, signedIn }: Props = $props();

	type Status = 'working' | 'copied' | 'no_photos' | 'translate_failed' | 'failed' | null;

	// The language the recipe is sent in. Visitors get the original text, so no choice is shown.
	// svelte-ignore state_referenced_locally
	let lang = $state<Language>(locale);
	let withPhotos = $state(true);
	let busy = $state(false);
	let status = $state<Status>(null);

	/** The recipe as plain text in the chosen language, with the headings in that language. */
	async function buildText() {
		const { translated, override } = await loadDisplay(recipe, lang, signedIn);
		const fields = shownFields(recipe, translated, override);
		const labels = {
			ingredients: m.recipe_ingredients_heading({}, { locale: lang }),
			steps: m.recipe_steps_heading({}, { locale: lang }),
			notes: m.recipe_notes_heading({}, { locale: lang }),
			source: m.ingredients_source({}, { locale: lang })
		};
		const link = recipe.sourceUrl ? sourceHref(recipe.sourceUrl, recipe.sourceStart) : null;
		return {
			title: fields.title,
			text: recipeToText(fields, labels, link),
			translateFailed: translated?.failed === true
		};
	}

	/** The recipe's photos as files, skipping any that cannot be fetched. */
	async function photoFiles(): Promise<File[]> {
		const files: File[] = [];
		for (const [i, photo] of photos.entries()) {
			try {
				const res = await fetch(photo.url);
				if (!res.ok) continue;
				const blob = await res.blob();
				const ext = blob.type.split('/')[1] ?? 'jpg';
				files.push(new File([blob], `recipe-${i + 1}.${ext}`, { type: blob.type }));
			} catch {
				// A photo that fails is left out; the text is still sent.
			}
		}
		return files;
	}

	/** Opens the phone's share sheet with the text and photos; copies the text where there is none. */
	async function send() {
		busy = true;
		status = 'working';
		try {
			const built = await buildText();
			const wantPhotos = withPhotos && photos.length > 0;
			const files = wantPhotos ? await photoFiles() : [];
			const data = { title: built.title, text: built.text };
			if (files.length > 0 && navigator.canShare?.({ ...data, files })) {
				await navigator.share({ ...data, files });
				status = built.translateFailed ? 'translate_failed' : null;
			} else if (navigator.share) {
				await navigator.share(data);
				status = wantPhotos ? 'no_photos' : built.translateFailed ? 'translate_failed' : null;
			} else {
				await navigator.clipboard.writeText(built.text);
				status = 'copied';
			}
		} catch (error) {
			// Closing the share sheet is not an error.
			status = error instanceof DOMException && error.name === 'AbortError' ? null : 'failed';
		} finally {
			busy = false;
		}
	}

	/** Copies the recipe text only, for pasting into any app. */
	async function copy() {
		busy = true;
		status = 'working';
		try {
			const built = await buildText();
			await navigator.clipboard.writeText(built.text);
			status = 'copied';
		} catch {
			status = 'failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="share-panel">
	<p class="meta">{m.share_title()}</p>
	{#if signedIn}
		<div class="share-row" role="group" aria-label={m.share_language()}>
			{#each LANGUAGES as code (code)}
				<button
					type="button"
					class="kind-chip"
					class:active={lang === code}
					aria-pressed={lang === code}
					onclick={() => (lang = code)}>{LANGUAGE_NAMES[code]}</button
				>
			{/each}
		</div>
	{/if}
	{#if photos.length > 0}
		<label class="share-photos">
			<input type="checkbox" bind:checked={withPhotos} />
			{m.share_photos()}
		</label>
	{/if}
	<div class="share-row">
		<button type="button" onclick={send} disabled={busy}>{m.share_send()}</button>
		<button type="button" class="link-button" onclick={copy} disabled={busy}
			>{m.share_copy()}</button
		>
	</div>
	{#if status === 'working'}
		<p role="status">{m.share_working()}</p>
	{:else if status === 'copied'}
		<p role="status">{m.share_copied()}</p>
	{:else if status === 'no_photos'}
		<p role="status">{m.share_no_photos()}</p>
	{:else if status === 'translate_failed'}
		<p role="status">{m.share_translate_failed()}</p>
	{:else if status === 'failed'}
		<p role="alert">{m.share_failed()}</p>
	{/if}
</div>

<style>
	.share-panel {
		display: grid;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}

	.share-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}

	/* The label is one line of text with a native-size checkbox beside it */
	.share-photos {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 400;
		cursor: pointer;
		white-space: nowrap;
	}

	/* Undoes the page-wide input style (full width, 44px box) for this checkbox */
	.share-photos input {
		flex: none;
		width: 1.1rem;
		height: 1.1rem;
		min-height: 0;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: none;
		accent-color: var(--accent);
	}

	.kind-chip.active {
		font-weight: 700;
	}
</style>
