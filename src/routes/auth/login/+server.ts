import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeUrl, newAttempt } from '#lib/server/cognito.js';
import {
	ATTEMPT_COOKIE,
	ATTEMPT_MAX_AGE_MS,
	cognitoConfig,
	sessionSecret
} from '#lib/server/auth-config.js';
import { signValue } from '#lib/server/session.js';

/** GET /auth/login -> starts a sign-in: remembers the attempt, then sends the user to Cognito. */
export const GET: RequestHandler = ({ cookies, url }) => {
	const attempt = newAttempt();
	cookies.set(
		ATTEMPT_COOKIE,
		signValue(
			{ state: attempt.state, verifier: attempt.verifier },
			sessionSecret(),
			ATTEMPT_MAX_AGE_MS
		),
		{
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: ATTEMPT_MAX_AGE_MS / 1000
		}
	);
	redirect(302, authorizeUrl(cognitoConfig(), new URL('/auth/callback', url).toString(), attempt), {
		external: true
	});
};
