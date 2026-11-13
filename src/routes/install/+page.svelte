<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';

	/** The app's address as a QR code (PNG data URL), made in the browser from the page's own address. */
	let qrImage = $state<string | null>(null);

	onMount(async () => {
		qrImage = await QRCode.toDataURL(page.url.origin, {
			margin: 1,
			width: 384,
			color: { dark: '#2b2320', light: '#fbf8f4' }
		});
	});
</script>

<svelte:head>
	<title>{m.install_title()}</title>
</svelte:head>

<main class="install">
	<h1>{m.install_title()}</h1>
	<p>{m.install_intro()}</p>

	{#if qrImage}
		<figure class="install-qr">
			<img src={qrImage} alt={m.install_qr_caption()} width="384" height="384" />
			<figcaption>{m.install_qr_caption()}</figcaption>
		</figure>
	{/if}

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
