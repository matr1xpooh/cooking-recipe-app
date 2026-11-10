<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>{m.signin_title()}</title>
</svelte:head>

<main class="signin">
	<h1>{m.signin_title()}</h1>
	{#if page.url.searchParams.has('error')}
		<p class="signin-error" role="alert">{m.signin_failed()}</p>
	{/if}
	<a class="signin-button" href={resolve('/auth/login')} data-sveltekit-reload
		>{m.signin_button()}</a
	>
</main>
