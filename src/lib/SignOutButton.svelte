<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { RECIPE_CACHE } from '#lib/recipes/offline-cache.js';

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

<!-- A text link, the same size as the other links: no panel and no filled button. -->
<form method="POST" action="/auth/logout" onsubmit={signOut}>
	<button type="submit">{m.sign_out()}</button>
</form>

<style>
	form {
		display: inline;
		margin: 0;
		padding: 0;
		background: none;
		border: 0;
		border-radius: 0;
	}

	button {
		min-height: 44px;
		padding: 0;
		background: none;
		border: 0;
		border-radius: 0;
		color: var(--accent);
		font: inherit;
		font-weight: 500;
		text-decoration: underline;
		cursor: pointer;
	}

	button:hover {
		color: var(--accent-hover);
	}
</style>
