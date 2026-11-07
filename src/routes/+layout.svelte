<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import LanguageSwitcher from '#lib/LanguageSwitcher.svelte';
	import type { LayoutProps } from './$types';
	import '../app.css';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="site-header">
	<LanguageSwitcher />
</header>

{@render children()}
