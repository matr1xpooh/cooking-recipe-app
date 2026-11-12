/**
 * Who may reach what. Every page and API route needs a signed-in user, except the sign-in
 * flow and static assets. API routes answer 401; pages go to the sign-in page.
 */

const PUBLIC_PATHS = ['/signin', '/auth/login', '/auth/callback', '/auth/logout'];
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
	signedIn: boolean;
	authDisabled: boolean;
}): Access {
	if (input.authDisabled || input.signedIn) return 'allow';
	if (isPublicPath(input.pathname)) return 'allow';
	return input.pathname === '/api' || input.pathname.startsWith('/api/')
		? 'unauthorized'
		: 'sign-in';
}
