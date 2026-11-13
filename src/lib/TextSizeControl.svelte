<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import {
		DEFAULT_TEXT_SIZE_INDEX,
		TEXT_SIZE_STEPS,
		TEXT_SIZE_STORAGE_KEY,
		nextTextSizeIndex,
		readTextSizeIndex,
		textSizePercent
	} from '#lib/text-size.js';

	let index = $state(DEFAULT_TEXT_SIZE_INDEX);

	/** Applies a step to the whole page and remembers it on this device. Storage may be blocked. */
	function apply(next: number) {
		index = next;
		document.documentElement.style.fontSize = textSizePercent(next);
		try {
			localStorage.setItem(TEXT_SIZE_STORAGE_KEY, String(next));
		} catch {
			// The size still applies for this visit.
		}
	}

	onMount(() => {
		let saved: string | null = null;
		try {
			saved = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
		} catch {
			// Storage blocked: use the default.
		}
		apply(readTextSizeIndex(saved));
	});

	const smallest = $derived(index === 0);
	const largest = $derived(index === TEXT_SIZE_STEPS.length - 1);
</script>

<div class="text-size" role="group" aria-label={m.text_size_label()}>
	<button
		type="button"
		class="step"
		aria-label={m.text_size_smaller()}
		title={m.text_size_smaller()}
		disabled={smallest}
		onclick={() => apply(nextTextSizeIndex(index, -1))}>A−</button
	>
	<button
		type="button"
		class="step large"
		aria-label={m.text_size_larger()}
		title={m.text_size_larger()}
		disabled={largest}
		onclick={() => apply(nextTextSizeIndex(index, 1))}>A+</button
	>
</div>

<style>
	.text-size {
		display: inline-flex;
		gap: 0.25rem;
	}

	.step {
		min-width: 44px;
		min-height: 44px;
		padding: 0 0.5rem;
		border: 1px solid var(--control-border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.step.large {
		font-size: 1.15em;
	}

	.step:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.step:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
