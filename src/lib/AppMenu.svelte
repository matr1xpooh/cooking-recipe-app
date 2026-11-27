<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import LanguageSwitcher from '#lib/LanguageSwitcher.svelte';
	import TextSizeControl from '#lib/TextSizeControl.svelte';
	import SignOutButton from '#lib/SignOutButton.svelte';

	/**
	 * One menu for the settings every page shares: language, text size and sign-in or sign-out.
	 * Pages add their own items through `children`. Closes on an outside tap and on Escape.
	 */
	let { showSignOut = false, children }: { showSignOut?: boolean; children?: Snippet } = $props();

	let menu = $state<HTMLDetailsElement | null>(null);

	function closeOnOutsideTap(event: PointerEvent) {
		if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
	}

	function closeOnEscape(event: KeyboardEvent) {
		if (event.key === 'Escape' && menu?.open) {
			menu.open = false;
			menu.querySelector('summary')?.focus();
		}
	}
</script>

<svelte:window onpointerdown={closeOnOutsideTap} onkeydown={closeOnEscape} />

<details class="app-menu" bind:this={menu}>
	<summary class="menu-button">{m.menu_open()}</summary>
	<div class="menu-panel">
		{#if children}{@render children()}{/if}
		<LanguageSwitcher />
		<TextSizeControl />
		{#if showSignOut}
			<SignOutButton />
		{:else}
			<a class="menu-link" href={resolve('/signin')}>{m.signin_button()}</a>
		{/if}
	</div>
</details>

<style>
	.app-menu {
		position: relative;
		margin: 0;
	}

	.menu-button {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 1rem;
		border: 1px solid var(--control-border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: var(--text-s);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	.menu-button::-webkit-details-marker {
		display: none;
	}

	.menu-panel {
		position: absolute;
		right: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.75rem;
		min-width: 14rem;
		margin-top: 0.25rem;
		padding: 0.75rem;
		border: 1px solid var(--control-border);
		border-radius: var(--radius);
		background: var(--surface);
	}
</style>
