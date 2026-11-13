<script lang="ts">
	import { parseNotes } from './notes.js';

	/** Text in the styling markup (see notes.ts). Rendered as spans and links, never as HTML. */
	let { source }: { source: string } = $props();
	const segments = $derived(parseNotes(source));
</script>

{#each segments as segment, i (i)}{#if segment.href}<!-- The address is user-supplied, but only http and https get here (see notes.ts). --><!-- eslint-disable-next-line svelte/no-navigation-without-resolve --><a
			href={segment.href}
			target="_blank"
			rel="noopener noreferrer"
			class:bold={segment.bold}
			class:italic={segment.italic}
			class={segment.color ? `note-${segment.color}` : undefined}>{segment.text}</a
		>{:else}<span
			class:bold={segment.bold}
			class:italic={segment.italic}
			class={segment.color ? `note-${segment.color}` : undefined}>{segment.text}</span
		>{/if}{/each}
