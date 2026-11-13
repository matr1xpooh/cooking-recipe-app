<script lang="ts">
	import RichText from './RichText.svelte';
	import { noteBlocks, type NoteLine } from './ingredient-lines.js';

	/** The notes written under one ingredient or step. */
	let { notes }: { notes: NoteLine[] } = $props();
	const blocks = $derived(noteBlocks(notes));
</script>

<div class="item-notes">
	{#each blocks as block, b (b)}
		{#if block.kind === 'list'}
			<ul>
				{#each block.items as item, i (i)}
					<li><RichText source={item.text} /></li>
				{/each}
			</ul>
		{:else}
			<p><RichText source={block.line.text} /></p>
		{/if}
	{/each}
</div>
