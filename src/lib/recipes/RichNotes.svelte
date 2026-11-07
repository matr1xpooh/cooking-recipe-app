<script lang="ts">
	import { parseNotes } from './notes.js';

	let { source }: { source: string } = $props();
	const segments = $derived(parseNotes(source));
</script>

<p class="notes">
	{#each segments as segment, i (i)}<span
			class:bold={segment.bold}
			class:italic={segment.italic}
			class={segment.color ? `note-${segment.color}` : undefined}>{segment.text}</span
		>{/each}
</p>
