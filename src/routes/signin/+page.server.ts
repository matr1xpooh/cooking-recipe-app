import { fail, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	cognitoConfig,
	SESSION_COOKIE,
	SESSION_MAX_AGE_MS,
	sessionSecret
} from '#lib/server/auth-config.js';
import { respondNewPassword, signInWithPassword } from '#lib/server/cognito-password.js';
import { recordUsage } from '#lib/server/usage.js';
import { verifyIdToken } from '#lib/server/cognito.js';
import { signingKeys } from '#lib/server/signing-keys.js';
import { safeNext } from '#lib/server/next.js';
import { readValue, signValue } from '#lib/server/session.js';

/** Holds the Cognito challenge while the user chooses a new password. Short-lived and signed. */
const PENDING_COOKIE = 'recipes_newpw';
const PENDING_MAX_AGE_MS = 5 * 60 * 1000;

function cookieOptions(url: URL, maxAgeMs: number) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: url.protocol === 'https:',
		maxAge: maxAgeMs / 1000
	};
}

/** Checks the ID token and starts the session. Throws when the token is not valid. */
async function startSession(cookies: Cookies, url: URL, idToken: string): Promise<void> {
	const user = verifyIdToken(idToken, cognitoConfig(), await signingKeys());
	cookies.set(
		SESSION_COOKIE,
		signValue({ ...user }, sessionSecret(), SESSION_MAX_AGE_MS),
		cookieOptions(url, SESSION_MAX_AGE_MS)
	);
	await recordUsage('signin');
}

export const load: PageServerLoad = ({ locals, url }) => {
	const next = safeNext(url.searchParams.get('next'));
	// Already signed in: nothing to do here.
	if (locals.user) redirect(303, next);
	return { next };
};

export const actions: Actions = {
	/** Email and password. Either starts the session, or asks for a new password first. */
	signIn: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const next = safeNext(String(form.get('next') ?? ''));
		if (!email || !password) return fail(400, { stage: 'sign-in', error: 'missing', email });

		let result;
		try {
			result = await signInWithPassword(cognitoConfig(), email, password);
		} catch {
			return fail(502, { stage: 'sign-in', error: 'other', email });
		}
		if (result.kind === 'wrong') return fail(400, { stage: 'sign-in', error: 'wrong', email });
		if (result.kind === 'failed') return fail(502, { stage: 'sign-in', error: 'other', email });
		if (result.kind === 'new-password') {
			cookies.set(
				PENDING_COOKIE,
				signValue({ email, session: result.session }, sessionSecret(), PENDING_MAX_AGE_MS),
				cookieOptions(url, PENDING_MAX_AGE_MS)
			);
			return { stage: 'new-password', email, next };
		}
		try {
			await startSession(cookies, url, result.idToken);
		} catch {
			return fail(502, { stage: 'sign-in', error: 'other', email });
		}
		redirect(303, next);
	},

	/** The new password for an account with a temporary one. */
	newPassword: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const first = String(form.get('password') ?? '');
		const again = String(form.get('again') ?? '');
		const next = safeNext(String(form.get('next') ?? ''));
		const pending = readValue<{ email: string; session: string }>(
			cookies.get(PENDING_COOKIE),
			sessionSecret()
		);
		if (!pending) return fail(400, { stage: 'sign-in', error: 'expired', email: '' });
		const email = pending.email;
		if (first !== again)
			return fail(400, { stage: 'new-password', error: 'mismatch', email, next });

		let result;
		try {
			result = await respondNewPassword(cognitoConfig(), email, first, pending.session);
		} catch {
			return fail(502, { stage: 'new-password', error: 'other', email, next });
		}
		if (result.kind === 'rejected')
			return fail(400, { stage: 'new-password', error: 'weak', email, next });
		if (result.kind === 'expired') {
			cookies.delete(PENDING_COOKIE, { path: '/' });
			return fail(400, { stage: 'sign-in', error: 'expired', email });
		}
		if (result.kind === 'failed')
			return fail(502, { stage: 'new-password', error: 'other', email, next });
		try {
			await startSession(cookies, url, result.idToken);
		} catch {
			return fail(502, { stage: 'sign-in', error: 'other', email });
		}
		cookies.delete(PENDING_COOKIE, { path: '/' });
		redirect(303, next);
	}
};
