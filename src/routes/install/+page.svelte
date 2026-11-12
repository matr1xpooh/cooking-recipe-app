<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.install_title()}</title>
</svelte:head>

<main class="install">
	<h1>{m.install_title()}</h1>
	<p>{m.install_intro()}</p>

	<p class="install-address-label">{m.install_address()}</p>
	<p class="install-address"><code>{page.url.origin}</code></p>

	<section class="install-platform">
		<h2>{m.install_ios_title()}</h2>
		<p>{m.install_ios_steps()}</p>
	</section>

	<section class="install-platform">
		<h2>{m.install_android_title()}</h2>
		<p>{m.install_android_steps()}</p>
	</section>
</main>
