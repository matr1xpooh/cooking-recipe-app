<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The step comes from the last action: the sign-in form, or the new-password form.
	const stage = $derived(form?.stage ?? 'sign-in');
	const email = $derived(form?.email ?? '');

	const messages: Record<string, () => string> = {
		missing: () => m.signin_error_missing(),
		wrong: () => m.signin_error_wrong(),
		other: () => m.signin_error_other(),
		expired: () => m.signin_error_expired(),
		mismatch: () => m.signin_new_password_mismatch(),
		weak: () => m.signin_new_password_weak()
	};
	const errorText = $derived(form?.error ? messages[form.error]?.() : null);

	let showPassword = $state(false);
	let showNewPassword = $state(false);
</script>

<svelte:head>
	<title>{m.signin_title()}</title>
</svelte:head>

<main class="signin">
	<h1>{stage === 'new-password' ? m.signin_new_password_title() : m.signin_title()}</h1>

	{#if errorText}
		<p class="signin-error" role="alert">{errorText}</p>
	{/if}

	{#if stage === 'new-password'}
		<p class="signin-hint">{m.signin_new_password_hint()}</p>
		<form class="signin-form" method="POST" action="?/newPassword">
			<input type="hidden" name="next" value={data.next} />
			<div class="signin-field">
				<label for="new-password">{m.signin_new_password_label()}</label>
				<div class="signin-password">
					<input
						id="new-password"
						name="password"
						type={showNewPassword ? 'text' : 'password'}
						autocomplete="new-password"
						minlength="8"
						required
					/>
					<button
						type="button"
						class="signin-toggle"
						aria-pressed={showNewPassword}
						onclick={() => (showNewPassword = !showNewPassword)}
						>{showNewPassword ? m.signin_hide_password() : m.signin_show_password()}</button
					>
				</div>
			</div>
			<div class="signin-field">
				<label for="again-password">{m.signin_new_password_again()}</label>
				<div class="signin-password">
					<input
						id="again-password"
						name="again"
						type={showNewPassword ? 'text' : 'password'}
						autocomplete="new-password"
						minlength="8"
						required
					/>
				</div>
			</div>
			<button class="signin-submit" type="submit">{m.signin_new_password_submit()}</button>
		</form>
	{:else}
		<form class="signin-form" method="POST" action="?/default">
			<input type="hidden" name="next" value={data.next} />
			<div class="signin-field">
				<label for="signin-email">{m.signin_email()}</label>
				<input
					id="signin-email"
					name="email"
					type="email"
					value={email}
					autocomplete="username"
					autocapitalize="none"
					spellcheck="false"
					required
				/>
			</div>
			<div class="signin-field">
				<label for="signin-password">{m.signin_password()}</label>
				<div class="signin-password">
					<input
						id="signin-password"
						name="password"
						type={showPassword ? 'text' : 'password'}
						autocomplete="current-password"
						required
					/>
					<button
						type="button"
						class="signin-toggle"
						aria-pressed={showPassword}
						onclick={() => (showPassword = !showPassword)}
						>{showPassword ? m.signin_hide_password() : m.signin_show_password()}</button
					>
				</div>
			</div>
			<button class="signin-submit" type="submit">{m.signin_submit()}</button>
		</form>
	{/if}
</main>

<style>
	.signin {
		max-width: 26rem;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	.signin-form {
		display: grid;
		gap: 1rem;
	}

	.signin-field {
		display: grid;
		gap: 0.35rem;
	}

	.signin-field label {
		font-weight: 600;
	}

	.signin-field input {
		width: 100%;
		box-sizing: border-box;
		min-height: 44px;
	}

	.signin-password {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
	}

	.signin-password input {
		flex: 1;
		min-width: 0;
	}

	.signin-toggle {
		min-height: 44px;
		padding: 0 0.8rem;
		white-space: nowrap;
	}

	.signin-toggle[aria-pressed='true'] {
		background: var(--muted);
		color: var(--surface);
	}

	.signin-submit {
		min-height: 48px;
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: 600;
	}

	.signin-error {
		color: var(--danger);
		font-weight: 600;
	}

	.signin-hint {
		color: var(--muted);
	}
</style>
