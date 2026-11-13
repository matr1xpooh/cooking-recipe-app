/**
 * Who may reach what. The sign-in flow and static assets are open to everyone. Recipes
 * can be read by anyone with the link (GET only). Everything else needs a signed-in user:
 * API routes answer 401, pages go to the sign-in page.
 */

const PUBLIC_PATHS = ['/signin', '/auth/login', '/auth/callback', '/auth/logout'];
const PUBLIC_PREFIXES = ['/_app/', '/icons/'];
const PUBLIC_FILES = ['/robots.txt', '/favicon.svg', '/manifest.webmanifest', '/service-worker.js'];

/**
 * Read-only views of recipes, open to anyone. Ids are one path segment; the names that
 * are routes of their own (new, translate, import, import-image, ocr) are excluded.
 */
const PUBLIC_READ_PATHS: RegExp[] = [
	/^\/recipes$/,
	/^\/recipes\/(?!new$)[^/]+$/,
	/^\/api\/recipes$/,
	/^\/api\/recipes\/(?!(?:translate|import|import-image|ocr)$)[^/]+$/,
	/^\/api\/recipes\/[^/]+\/images\/[^/]+$/,
	/^\/api\/recipes\/[^/]+\/translations\/[^/]+$/
];

export type Access = 'allow' | 'unauthorized' | 'sign-in';

export function isPublicPath(pathname: string): boolean {
	return (
		PUBLIC_PATHS.includes(pathname) ||
		PUBLIC_FILES.includes(pathname) ||
		PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
	);
}

/** True for a GET or HEAD of a recipe view that anyone may read. */
export function isPublicRead(pathname: string, method: string): boolean {
	if (method !== 'GET' && method !== 'HEAD') return false;
	return PUBLIC_READ_PATHS.some((pattern) => pattern.test(pathname));
}

/**
 * Machine translation of recipe text, open to anyone with the link. It only reads the
 * text it is given and stores nothing but cached translations; it is rate limited per
 * visitor group (see LIMITS in rate-limit.ts).
 */
export const PUBLIC_TRANSLATE_PATH = '/api/recipes/translate';

export function isPublicTranslate(pathname: string, method: string): boolean {
	return method === 'POST' && pathname === PUBLIC_TRANSLATE_PATH;
}

export function decideAccess(input: {
	pathname: string;
	method: string;
	signedIn: boolean;
	authDisabled: boolean;
}): Access {
	if (input.authDisabled || input.signedIn) return 'allow';
	if (
		isPublicPath(input.pathname) ||
		isPublicRead(input.pathname, input.method) ||
		isPublicTranslate(input.pathname, input.method)
	) {
		return 'allow';
	}
	return input.pathname === '/api' || input.pathname.startsWith('/api/')
		? 'unauthorized'
		: 'sign-in';
}
