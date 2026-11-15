/**
 * Who may reach what. The sign-in page and static assets are open to everyone. Everything else
 * needs a signed-in user: API routes answer 401, pages go to the sign-in page.
 */

const PUBLIC_PATHS = ['/signin', '/auth/logout'];
const PUBLIC_PREFIXES = ['/_app/', '/icons/'];
const PUBLIC_FILES = ['/robots.txt', '/favicon.svg', '/manifest.webmanifest', '/service-worker.js'];

export type Access = 'allow' | 'unauthorized' | 'sign-in';

export function isPublicPath(pathname: string): boolean {
	return (
		PUBLIC_PATHS.includes(pathname) ||
		PUBLIC_FILES.includes(pathname) ||
		PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
	);
}

export function decideAccess(input: {
	pathname: string;
	method: string;
	signedIn: boolean;
	authDisabled: boolean;
}): Access {
	if (input.authDisabled || input.signedIn) return 'allow';
	if (isPublicPath(input.pathname)) return 'allow';
	return input.pathname === '/api' || input.pathname.startsWith('/api/')
		? 'unauthorized'
		: 'sign-in';
}
