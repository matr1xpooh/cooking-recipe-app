<script lang="ts">
	import type { Snippet } from 'svelte';
	import RichText from './RichText.svelte';
	import { noteBlocks, type NoteLine } from './ingredient-lines.js';

	/**
	 * The notes written under one ingredient or step. When `edit` is given, each note is drawn by
	 * it, with its position in the stored list (`indexes`), so a note can be changed in place.
	 */
	let {
		notes,
		indexes = null,
		part = null,
		edit = null
	}: {
		notes: NoteLine[];
		indexes?: number[] | null;
		part?: 'ingredients' | 'steps' | null;
		edit?: Snippet<['ingredients' | 'steps', number, string, boolean, boolean]> | null;
	} = $props();
	const blocks = $derived(noteBlocks(notes));

	/** The stored position of a note, or null when notes are shown read-only. */
	function indexOf(note: NoteLine): number | null {
		if (!indexes || !part || !edit) return null;
		return indexes[notes.indexOf(note)] ?? null;
	}
</script>

{#snippet noteText(note: NoteLine)}
	{#if indexOf(note) !== null && edit && part}
		{@render edit(part, indexOf(note) ?? 0, note.text, true, true)}
	{:else}
		<RichText source={note.text} />
	{/if}
{/snippet}

<div class="item-notes">
	{#each blocks as block, b (b)}
		{#if block.kind === 'list'}
			<ul>
				{#each block.items as item, i (i)}
					<li>{@render noteText(item)}</li>
				{/each}
			</ul>
		{:else}
			<p>{@render noteText(block.line)}</p>
		{/if}
	{/each}
</div>
