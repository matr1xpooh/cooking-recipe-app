<script lang="ts" module>
	// The service worker is registered once per page load, even though the layout
	// re-renders when the language changes.
	let serviceWorkerRequested = false;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/env';
	import favicon from '#lib/assets/favicon.svg';
	import LanguageSwitcher from '#lib/LanguageSwitcher.svelte';
	import TextSizeControl from '#lib/TextSizeControl.svelte';
	import { page } from '$app/state';
	import SignOutButton from '#lib/SignOutButton.svelte';
	import { localeChange } from '#lib/locale-change.svelte.js';
	import type { LayoutProps } from './$types';
	import '../app.css';

	let { children, data }: LayoutProps = $props();

	// The recipe list draws its own header (title, languages, sign-out) on the same line.
	const ownHeader = $derived(page.route.id === '/recipes');

	// Offline reading: the service worker is registered in production builds only.
	onMount(() => {
		if (!serviceWorkerRequested && !dev && navigator.onLine && 'serviceWorker' in navigator) {
			serviceWorkerRequested = true;
			navigator.serviceWorker.register('/service-worker.js').catch(() => {});
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- Keyed on the language version: a language change re-renders the page in place. -->
{#key localeChange.version}
	{#if !ownHeader}
		<header class="site-header">
			<LanguageSwitcher />
			<TextSizeControl />
			{#if data.showSignOut}
				<SignOutButton />
			{/if}
		</header>
	{/if}

	{@render children()}
{/key}
