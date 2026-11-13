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

<form method="POST" action="/auth/logout" onsubmit={signOut}>
	<button type="submit" class="sign-out">{m.sign_out()}</button>
</form>
