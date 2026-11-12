import { describe, expect, it } from 'vitest';
import { decideAccess } from './access';

const signedOut = { signedIn: false, authDisabled: false };

describe('decideAccess', () => {
	it('lets a signed-in user reach pages and API routes', () => {
		expect(decideAccess({ pathname: '/recipes', signedIn: true, authDisabled: false })).toBe(
			'allow'
		);
		expect(decideAccess({ pathname: '/api/recipes', signedIn: true, authDisabled: false })).toBe(
			'allow'
		);
	});

	it('sends a signed-out visitor to sign-in for a page', () => {
		expect(decideAccess({ pathname: '/recipes', ...signedOut })).toBe('sign-in');
		expect(decideAccess({ pathname: '/tags', ...signedOut })).toBe('sign-in');
	});

	it('answers 401 for a signed-out API call', () => {
		expect(decideAccess({ pathname: '/api/recipes', ...signedOut })).toBe('unauthorized');
		expect(decideAccess({ pathname: '/api/recipes/translate', ...signedOut })).toBe('unauthorized');
	});

	it('does not treat a page whose name starts with "api" as an API route', () => {
		expect(decideAccess({ pathname: '/apiary', ...signedOut })).toBe('sign-in');
	});

	it('leaves the sign-in flow and static files open', () => {
		for (const pathname of [
			'/signin',
			'/auth/login',
			'/auth/callback',
			'/auth/logout',
			'/manifest.webmanifest',
			'/service-worker.js',
			'/icons/icon-192.png',
			'/robots.txt',
			'/_app/immutable/entry.js'
		]) {
			expect(decideAccess({ pathname, ...signedOut })).toBe('allow');
		}
	});

	it('allows everything when auth is switched off', () => {
		expect(decideAccess({ pathname: '/api/recipes', signedIn: false, authDisabled: true })).toBe(
			'allow'
		);
	});
});
