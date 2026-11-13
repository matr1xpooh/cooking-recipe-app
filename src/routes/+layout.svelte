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
	import { m } from '#lib/paraglide/messages.js';
	import { localeChange } from '#lib/locale-change.svelte.js';
	import { RECIPE_CACHE } from '#lib/recipes/offline-cache.js';
	import type { LayoutProps } from './$types';
	import '../app.css';

	let { children, data }: LayoutProps = $props();

	// Offline reading: the service worker is registered in production builds only.
	onMount(() => {
		if (!serviceWorkerRequested && !dev && navigator.onLine && 'serviceWorker' in navigator) {
			serviceWorkerRequested = true;
			navigator.serviceWorker.register('/service-worker.js').catch(() => {});
		}
	});

	// Signing out forgets the recipes kept on this device, then ends the session.
	async function signOut(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		try {
			await caches.delete(RECIPE_CACHE);
		} catch {
			// No Cache API here: nothing was kept.
		}
		form.submit();
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- Keyed on the language version: a language change re-renders the page in place. -->
{#key localeChange.version}
	<header class="site-header">
		<LanguageSwitcher />
		{#if data.showSignOut}
			<form method="POST" action="/auth/logout" onsubmit={signOut}>
				<button type="submit" class="sign-out">{m.sign_out()}</button>
			</form>
		{/if}
	</header>

	{@render children()}
{/key}
