<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/env';
	import favicon from '#lib/assets/favicon.svg';
	import LanguageSwitcher from '#lib/LanguageSwitcher.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { RECIPE_CACHE } from '#lib/recipes/offline-cache.js';
	import type { LayoutProps } from './$types';
	import '../app.css';

	let { children, data }: LayoutProps = $props();

	// Offline reading: the service worker is registered in production builds only.
	onMount(() => {
		if (!dev && navigator.onLine && 'serviceWorker' in navigator) {
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

<header class="site-header">
	<LanguageSwitcher />
	{#if data.showSignOut}
		<form method="POST" action="/auth/logout" onsubmit={signOut}>
			<button type="submit" class="sign-out">{m.sign_out()}</button>
		</form>
	{/if}
</header>

{@render children()}
