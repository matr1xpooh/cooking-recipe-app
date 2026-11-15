import { describe, expect, it } from 'vitest';
import { decideAccess } from './access';

const signedOut = { signedIn: false, authDisabled: false };

function access(pathname: string, method = 'GET', extra = signedOut) {
	return decideAccess({ pathname, method, ...extra });
}

describe('decideAccess', () => {
	it('lets a signed-in user reach pages and API routes', () => {
		const signedIn = { signedIn: true, authDisabled: false };
		expect(access('/recipes', 'GET', signedIn)).toBe('allow');
		expect(access('/api/recipes', 'POST', signedIn)).toBe('allow');
	});

	it('sends a signed-out visitor to sign-in for an editing page', () => {
		expect(access('/recipes/new')).toBe('sign-in');
		expect(access('/recipes/abc/edit')).toBe('sign-in');
		expect(access('/tags')).toBe('sign-in');
	});

	it('answers 401 for a signed-out write to the API', () => {
		expect(access('/api/recipes', 'POST')).toBe('unauthorized');
		expect(access('/api/recipes/translate', 'POST')).toBe('unauthorized');
		expect(access('/api/recipes/abc', 'DELETE')).toBe('unauthorized');
		expect(access('/api/me/language', 'PUT')).toBe('unauthorized');
	});

	it('sends a signed-out visitor to sign-in for recipes, not just editing pages', () => {
		expect(access('/recipes')).toBe('sign-in');
		expect(access('/recipes/abc')).toBe('sign-in');
		expect(access('/recipes/abc/cook')).toBe('sign-in');
	});

	it('answers 401 for a signed-out read of the API', () => {
		expect(access('/api/recipes')).toBe('unauthorized');
		expect(access('/api/recipes/abc')).toBe('unauthorized');
		expect(access('/api/recipes/abc/images/img-1')).toBe('unauthorized');
		expect(access('/api/recipes/abc/translations/es')).toBe('unauthorized');
	});

	it('does not open the recipe names that are routes of their own', () => {
		expect(access('/api/recipes/translate')).toBe('unauthorized');
		expect(access('/api/recipes/import')).toBe('unauthorized');
		expect(access('/api/recipes/import-image')).toBe('unauthorized');
		expect(access('/api/recipes/ocr')).toBe('unauthorized');
		expect(access('/recipes/new')).toBe('sign-in');
	});

	it('does not open nested or editing paths under a recipe', () => {
		expect(access('/recipes/abc/edit')).toBe('sign-in');
		expect(access('/api/recipes/abc/images')).toBe('unauthorized');
	});

	it('does not treat a page whose name starts with "api" as an API route', () => {
		expect(access('/apiary')).toBe('sign-in');
	});

	it('leaves the sign-in flow and static files open', () => {
		for (const pathname of [
			'/signin',
			'/auth/logout',
			'/manifest.webmanifest',
			'/service-worker.js',
			'/icons/icon-192.png',
			'/robots.txt',
			'/_app/immutable/entry.js'
		]) {
			expect(access(pathname, 'POST'), pathname).toBe('allow');
		}
	});

	it('allows everything when auth is switched off', () => {
		expect(access('/api/recipes', 'POST', { signedIn: false, authDisabled: true })).toBe('allow');
	});
});
