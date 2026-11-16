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
						aria-label={showNewPassword ? m.signin_hide_password() : m.signin_show_password()}
						title={showNewPassword ? m.signin_hide_password() : m.signin_show_password()}
						onclick={() => (showNewPassword = !showNewPassword)}
					>
						{#if showNewPassword}<svg
								viewBox="0 0 24 24"
								width="24"
								height="24"
								aria-hidden="true"
								focusable="false"
								><path
									fill="currentColor"
									d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
								/></svg
							>{:else}<svg
								viewBox="0 0 24 24"
								width="24"
								height="24"
								aria-hidden="true"
								focusable="false"
								><path
									fill="currentColor"
									d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
								/></svg
							>{/if}
					</button>
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
					<button
						type="button"
						class="signin-toggle"
						aria-pressed={showNewPassword}
						aria-label={showNewPassword ? m.signin_hide_password() : m.signin_show_password()}
						title={showNewPassword ? m.signin_hide_password() : m.signin_show_password()}
						onclick={() => (showNewPassword = !showNewPassword)}
					>
						{#if showNewPassword}<svg
								viewBox="0 0 24 24"
								width="24"
								height="24"
								aria-hidden="true"
								focusable="false"
								><path
									fill="currentColor"
									d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
								/></svg
							>{:else}<svg
								viewBox="0 0 24 24"
								width="24"
								height="24"
								aria-hidden="true"
								focusable="false"
								><path
									fill="currentColor"
									d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
								/></svg
							>{/if}
					</button>
				</div>
			</div>
			<button class="signin-submit" type="submit">{m.signin_new_password_submit()}</button>
		</form>
	{:else}
		<form class="signin-form" method="POST" action="?/signIn">
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
						aria-label={showPassword ? m.signin_hide_password() : m.signin_show_password()}
						title={showPassword ? m.signin_hide_password() : m.signin_show_password()}
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}<svg
								viewBox="0 0 24 24"
								width="24"
								height="24"
								aria-hidden="true"
								focusable="false"
								><path
									fill="currentColor"
									d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
								/></svg
							>{:else}<svg
								viewBox="0 0 24 24"
								width="24"
								height="24"
								aria-hidden="true"
								focusable="false"
								><path
									fill="currentColor"
									d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
								/></svg
							>{/if}
					</button>
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
		/* Overrides the global form rules for the last div in a form (right-aligned, centred). */
		align-items: stretch;
		justify-content: stretch;
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
		position: relative;
	}

	.signin-password input {
		width: 100%;
		box-sizing: border-box;
		padding-right: 3rem;
	}

	.signin-toggle {
		position: absolute;
		right: 0;
		top: 0;
		height: 100%;
		width: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--muted);
	}

	.signin-toggle[aria-pressed='true'] {
		color: var(--accent);
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
