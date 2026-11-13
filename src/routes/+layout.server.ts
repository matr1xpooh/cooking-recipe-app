import type { LayoutServerLoad } from './$types';
import { authDisabled } from '#lib/server/auth-config.js';

/**
 * Whether the header shows a sign-out button, and whether the pages show editing controls:
 * both only when the user is signed in (or sign-in is switched off for local development).
 */
export const load: LayoutServerLoad = ({ locals }) => {
	const signedIn = authDisabled() || locals.user !== null;
	return { showSignOut: !authDisabled() && locals.user !== null, signedIn };
};
