<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import { isLanguage, type Language } from '#lib/recipes/languages.js';
	import { loadDisplay, shownFields, type Translated } from '#lib/recipes/display.js';
	import { clampStep, cookSteps } from '#lib/recipes/cooking.js';
	import { attachNotes, groupIngredients } from '#lib/recipes/ingredient-lines.js';
	import { ingredientsPerStep } from '#lib/recipes/step-ingredients.js';
	import {
		speak,
		startListening,
		voiceSupported,
		type VoiceCommand
	} from '#lib/recipes/voice-commands.js';
	import type { EditedTranslation } from '#lib/recipes/recipe-api.js';
	import RichText from '#lib/recipes/RichText.svelte';
	import NoteBlock from '#lib/recipes/NoteBlock.svelte';
	import { keepScreenAwake } from '#lib/wake-lock.js';

	/** Swipes shorter than this are taps or wobbles, not page turns. */
	const SWIPE_PX = 60;

	let loaded = $state(false);
	let index = $state(0);
	let translated = $state<Translated | null>(null);
	let override = $state<EditedTranslation | null>(null);
	let voiceAvailable = $state(false);
	let voiceOn = $state(false);
	let stopListening: (() => void) | null = null;
	let touchStartX: number | null = null;

	const recipe = $derived(recipeStore.recipes.find((r) => r.id === page.params.id));
	const locale = getLocale();
	const language: Language = isLanguage(locale) ? locale : 'en';

	onMount(() => {
		recipeStore.load();
		loaded = true;
		voiceAvailable = voiceSupported();
		// Cooking is hands-on for long stretches: keep the phone's screen on.
		return keepScreenAwake();
	});

	onMount(() => () => {
		stopListening?.();
		stopListening = null;
	});

	// Translate into the site language, as the recipe page does. Stale responses are ignored.
	$effect(() => {
		const current = recipe;
		if (!current || !isLanguage(locale)) return;
		let cancelled = false;
		loadDisplay(current, locale, page.data.signedIn).then((result) => {
			if (cancelled) return;
			translated = result.translated;
			override = result.override;
		});
		return () => {
			cancelled = true;
		};
	});

	const shown = $derived(recipe ? shownFields(recipe, translated, override) : null);
	const steps = $derived(shown ? cookSteps(shown.steps) : []);
	const position = $derived(clampStep(index, steps.length));
	const step = $derived(steps[position]);
	// Steps and ingredients are matched in the language the recipe was written in. Translations are
	// worded separately, so their spellings can differ ("chili" and "chilli"). The matched lines are
	// then shown in the displayed language, when the translation keeps the same number of lines.
	const matches = $derived(
		recipe
			? ingredientsPerStep(
					cookSteps(recipe.steps).map((s) => s.text),
					recipe.ingredients
				)
			: []
	);
	const stepIngredients = $derived.by(() => {
		if (!recipe || !shown) return [];
		const original = recipe.ingredients;
		const translatedLines =
			shown.ingredients.length === original.length ? shown.ingredients : original;
		return (matches[position] ?? []).map((used) => ({
			line: translatedLines[used.index] ?? original[used.index] ?? '',
			remaining: used.remaining
		}));
	});
	// The ingredient list with its measurements, in the same groups and order as the recipe page.
	const ingredientGroups = $derived(
		shown
			? groupIngredients(shown.ingredients).map((group) => ({
					heading: group.heading,
					entries: attachNotes(group.items)
				}))
			: []
	);

	function go(delta: 1 | -1) {
		index = clampStep(position + delta, steps.length);
	}

	function handleCommand(command: VoiceCommand) {
		if (command === 'next') go(1);
		else if (command === 'back') go(-1);
		else if (step) speak(step.text, language);
	}

	function toggleVoice() {
		if (stopListening) {
			stopListening();
			stopListening = null;
			voiceOn = false;
			return;
		}
		stopListening = startListening(language, handleCommand);
		voiceOn = true;
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') go(1);
		else if (event.key === 'ArrowLeft') go(-1);
	}

	function touchBegin(event: TouchEvent) {
		touchStartX = event.touches[0]?.clientX ?? null;
	}

	function touchFinish(event: TouchEvent) {
		if (touchStartX === null) return;
		const endX = event.changedTouches[0]?.clientX ?? touchStartX;
		const dx = endX - touchStartX;
		touchStartX = null;
		if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
	}
</script>

<svelte:head>
	<title>{recipe?.title ?? m.recipes_title()}</title>
</svelte:head>

<svelte:window onkeydown={onKey} />

<main class="cook" ontouchstart={touchBegin} ontouchend={touchFinish}>
	{#if recipe && shown}
		<header class="cook-header">
			<a class="close" href={resolve('/recipes/[id]', { id: recipe.id })}>{m.cook_close()}</a>
			<p class="cook-title">{shown.title}</p>
		</header>

		{#if ingredientGroups.length > 0}
			<details class="ingredients">
				<summary>{m.cook_all_ingredients()}</summary>
				{#each ingredientGroups as group, g (g)}
					{#if group.heading !== null}
						<h2 class="ingredient-heading">{group.heading}</h2>
					{/if}
					<ul class="plain">
						{#each group.entries as entry, i (i)}
							{#if entry.item !== null}
								<li>
									{entry.item}{#if entry.notes.length > 0}<NoteBlock notes={entry.notes} />{/if}
								</li>
							{/if}
						{/each}
					</ul>
				{/each}
			</details>
		{/if}

		{#if step}
			<p class="progress" aria-live="polite">
				{m.cook_progress({ n: position + 1, total: steps.length })}
			</p>
			<div class="step">
				<RichText source={step.text} />
				{#if step.notes.length > 0}<NoteBlock notes={step.notes} />{/if}
			</div>
			<section class="step-ingredients" aria-label={m.cook_ingredients_for_step()}>
				{#if stepIngredients.length > 0}
					<h2>{m.cook_ingredients_for_step()}</h2>
					<ul class="plain">
						{#each stepIngredients as item, i (i)}
							<li>
								{item.line}{#if item.remaining}
									<span class="remaining">({m.cook_remaining()})</span>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
			<nav class="controls" aria-label={m.recipe_steps_heading()}>
				<button type="button" class="big" disabled={position === 0} onclick={() => go(-1)}>
					{m.cook_back()}
				</button>
				<button
					type="button"
					class="big primary"
					disabled={position === steps.length - 1}
					onclick={() => go(1)}
				>
					{m.cook_next()}
				</button>
			</nav>
			{#if voiceAvailable}
				<div class="voice">
					<button type="button" class="link-button" aria-pressed={voiceOn} onclick={toggleVoice}>
						{voiceOn ? m.cook_voice_off() : m.cook_voice_on()}
					</button>
					{#if voiceOn}<p class="meta">{m.cook_voice_hint()}</p>{/if}
				</div>
			{/if}
		{:else}
			<p>{m.cook_no_steps()}</p>
		{/if}
	{:else if loaded}
		<h1>{m.recipe_not_found()}</h1>
	{/if}
</main>

<style>
	.cook {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-height: 100dvh;
	}

	.cook-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.close {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 0.75rem;
		border: 1px solid var(--control-border);
		border-radius: var(--radius);
		color: var(--text);
		text-decoration: none;
	}

	.cook-title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.25;
		color: var(--text);
		text-align: right;
	}

	.progress {
		margin: 0;
		color: var(--muted);
		font-weight: 600;
	}

	.step {
		flex: 1;
		font-size: 1.2rem;
		line-height: 1.5;
	}

	.controls {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	/*
	 * The global button rules (app.css) set the background on hover, and they are more specific
	 * than a plain class. The selectors below use "button." and repeat the state so they win.
	 */
	button.big,
	button.big:hover:not(:disabled),
	button.big:focus-visible {
		min-height: 72px;
		border: 2px solid var(--control-border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 1.25rem;
		font-weight: 700;
		cursor: pointer;
	}

	button.big.primary,
	button.big.primary:focus-visible {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-text);
	}

	button.big.primary:hover:not(:disabled) {
		border-color: var(--accent-hover);
		background: var(--accent-hover);
		color: var(--accent-text);
	}

	button.big:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.voice {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
	}

	.voice .link-button {
		min-height: 44px;
	}
	/* Ingredients with their measurements, above the step. Scrolls when the list is long. */
	details.ingredients {
		max-height: 40vh;
		overflow-y: auto;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}

	details.ingredients summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		font-weight: 700;
		cursor: pointer;
	}

	.ingredient-heading {
		margin: 0.5rem 0 0.25rem;
		font-size: 1rem;
	}

	details.ingredients ul {
		margin: 0.25rem 0 0.5rem;
		padding-left: 1.25rem;
		font-size: 1rem;
	}
	/* The ingredients this step uses, with their amounts, under the step text. */
	section.step-ingredients {
		padding: 0.75rem 1rem;
		border-left: 4px solid var(--accent);
		border-radius: var(--radius);
		background: var(--surface);
	}

	section.step-ingredients h2 {
		margin: 0 0 0.25rem;
		font-size: 1rem;
		color: var(--muted);
	}

	section.step-ingredients ul {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
	}

	.remaining {
		color: var(--muted);
		font-weight: 400;
	}
</style>
