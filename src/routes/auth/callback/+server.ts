import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode, fetchJwks, verifyIdToken, type Jwk } from '#lib/server/cognito.js';
import {
	ATTEMPT_COOKIE,
	cognitoConfig,
	SESSION_COOKIE,
	SESSION_MAX_AGE_MS,
	sessionSecret
} from '#lib/server/auth-config.js';
import { readValue, signValue } from '#lib/server/session.js';

const KEY_TTL_MS = 60 * 60 * 1000;
let keys: { at: number; list: Jwk[] } | null = null;

async function signingKeys(): Promise<Jwk[]> {
	if (keys && Date.now() - keys.at < KEY_TTL_MS) return keys.list;
	const list = await fetchJwks(cognitoConfig());
	keys = { at: Date.now(), list };
	return list;
}

/**
 * GET /auth/callback -> Cognito returns here with a code. Checks the state, exchanges the
 * code, verifies the ID token and starts a session. Any failure goes back to /signin.
 */
export const GET: RequestHandler = async ({ cookies, url }) => {
	const attempt = readValue<{ state: string; verifier: string }>(
		cookies.get(ATTEMPT_COOKIE),
		sessionSecret()
	);
	cookies.delete(ATTEMPT_COOKIE, { path: '/' });
	const code = url.searchParams.get('code');
	if (!attempt || !code || url.searchParams.get('state') !== attempt.state) {
		redirect(303, '/signin?error=1');
	}

	try {
		const config = cognitoConfig();
		const idToken = await exchangeCode(config, {
			code,
			verifier: attempt.verifier,
			redirectUri: new URL('/auth/callback', url).toString()
		});
		const user = verifyIdToken(idToken, config, await signingKeys());
		cookies.set(SESSION_COOKIE, signValue({ ...user }, sessionSecret(), SESSION_MAX_AGE_MS), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: SESSION_MAX_AGE_MS / 1000
		});
	} catch {
		redirect(303, '/signin?error=1');
	}
	redirect(303, '/');
};
