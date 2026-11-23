<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { Language } from '#lib/recipes/languages.js';
	import { sourceHref, type Recipe } from '#lib/recipes/recipe.js';
	import type { RecipeFields } from '#lib/recipes/translation-fields.js';
	import { recipeToText } from '#lib/recipes/share-text.js';

	interface Props {
		recipe: Recipe;
		/** The text the page is showing: the translation, the edited one, or the original. */
		fields: RecipeFields;
		/** True when the machine translation failed and the original text is shown instead. */
		translateFailed: boolean;
		photos: { id: string; url: string }[];
		/** The site language; the headings are written in it. */
		locale: Language;
	}

	let { recipe, fields, translateFailed, photos, locale }: Props = $props();

	type Status = 'working' | 'copied' | 'no_photos' | 'translate_failed' | 'failed' | null;

	let busy = $state(false);
	let status = $state<Status>(null);

	/** The text the page is showing, with the headings in the site language. */
	function buildText() {
		const labels = {
			ingredients: m.recipe_ingredients_heading({}, { locale }),
			steps: m.recipe_steps_heading({}, { locale }),
			notes: m.recipe_notes_heading({}, { locale }),
			source: m.ingredients_source({}, { locale })
		};
		const link = recipe.sourceUrl ? sourceHref(recipe.sourceUrl, recipe.sourceStart) : null;
		return {
			title: fields.title,
			text: recipeToText(fields, labels, link),
			translateFailed
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
			const built = buildText();
			const wantPhotos = photos.length > 0;
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
			const built = buildText();
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
</style>
