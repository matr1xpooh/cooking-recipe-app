<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { NoteColor } from './notes.js';
	import type { MarkupAction } from './markup-edit.js';

	/**
	 * Buttons that add notes markup to the text field they sit above. Ingredient lines
	 * take notes and lists only (styles false); steps and notes also take bold, italic
	 * and colour.
	 */
	let {
		label,
		styles = true,
		onaction
	}: {
		label: string;
		styles?: boolean;
		onaction: (action: MarkupAction) => void;
	} = $props();

	const colors: { key: NoteColor; label: () => string }[] = [
		{ key: 'red', label: () => m.color_red() },
		{ key: 'orange', label: () => m.color_orange() },
		{ key: 'green', label: () => m.color_green() },
		{ key: 'blue', label: () => m.color_blue() },
		{ key: 'purple', label: () => m.color_purple() }
	];
</script>

<div class="toolbar" role="toolbar" aria-label={label}>
	{#if styles}
		<button type="button" onclick={() => onaction({ kind: 'bold' })} aria-label={m.notes_bold()}>
			<strong>B</strong>
		</button>
		<button
			type="button"
			onclick={() => onaction({ kind: 'italic' })}
			aria-label={m.notes_italic()}
		>
			<em>I</em>
		</button>
		{#each colors as color (color.key)}
			<button
				type="button"
				class="swatch note-{color.key}"
				onclick={() => onaction({ kind: 'color', color: color.key })}
				aria-label={color.label()}
			>
				{color.label()}
			</button>
		{/each}
		<button type="button" onclick={() => onaction({ kind: 'link' })}>{m.notes_link()}</button>
	{/if}
	<button type="button" onclick={() => onaction({ kind: 'note' })}>{m.notes_note()}</button>
	<button type="button" onclick={() => onaction({ kind: 'list' })}>{m.notes_list()}</button>
</div>
