<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/env';
	import favicon from '#lib/assets/favicon.svg';
	import LanguageSwitcher from '#lib/LanguageSwitcher.svelte';
	import type { LayoutProps } from './$types';
	import '../app.css';

	let { children }: LayoutProps = $props();

	// Offline reading: the service worker is registered in production builds only.
	onMount(() => {
		if (!dev && navigator.onLine && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch(() => {});
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="site-header">
	<LanguageSwitcher />
</header>

{@render children()}
