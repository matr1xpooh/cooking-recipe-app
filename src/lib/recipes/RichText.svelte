<script lang="ts">
	import { parseNotes } from './notes.js';

	/** Text in the styling markup (see notes.ts). Rendered as spans, never as HTML. */
	let { source }: { source: string } = $props();
	const segments = $derived(parseNotes(source));
</script>

{#each segments as segment, i (i)}<span
		class:bold={segment.bold}
		class:italic={segment.italic}
		class={segment.color ? `note-${segment.color}` : undefined}>{segment.text}</span
	>{/each}
