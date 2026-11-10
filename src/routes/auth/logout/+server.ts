import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logoutUrl } from '#lib/server/cognito.js';
import { cognitoConfig, SESSION_COOKIE } from '#lib/server/auth-config.js';

/** POST /auth/logout -> ends the session here and at Cognito. */
export const POST: RequestHandler = ({ cookies, url }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, logoutUrl(cognitoConfig(), new URL('/signin', url).toString()), { external: true });
};
