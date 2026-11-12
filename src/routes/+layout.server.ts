import type { LayoutServerLoad } from './$types';
import { authDisabled } from '#lib/server/auth-config.js';

/** Whether the header shows a sign-out button: only when sign-in is on and the user is signed in. */
export const load: LayoutServerLoad = ({ locals }) => ({
	showSignOut: !authDisabled() && locals.user !== null
});
