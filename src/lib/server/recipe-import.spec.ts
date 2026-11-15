import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPublicPage, isPrivateAddress, ImportError, parseHttpUrl } from './recipe-import';

describe('isPrivateAddress', () => {
	it.each([
		'127.0.0.1',
		'10.1.2.3',
		'172.16.0.1',
		'172.31.255.255',
		'192.168.1.1',
		'169.254.169.254',
		'100.64.0.1',
		'0.0.0.0',
		'::1',
		'::',
		'fc00::1',
		'fd12:3456::1',
		'fe80::1',
		'::ffff:127.0.0.1',
		'::ffff:7f00:1'
	])('blocks %s', (ip) => {
		expect(isPrivateAddress(ip)).toBe(true);
	});

	it.each(['8.8.8.8', '172.32.0.1', '172.15.0.1', '93.184.216.34', '2606:4700:4700::1111'])(
		'allows %s',
		(ip) => {
			expect(isPrivateAddress(ip)).toBe(false);
		}
	);
});

describe('parseHttpUrl', () => {
	it('rejects non-http schemes and garbage', () => {
		expect(() => parseHttpUrl('javascript:alert(1)')).toThrow(ImportError);
		expect(() => parseHttpUrl('file:///etc/passwd')).toThrow(ImportError);
		expect(() => parseHttpUrl('not a url')).toThrow(ImportError);
	});
});

describe('fetchPublicPage', () => {
	it('refuses loopback and private targets without making a request', async () => {
		await expect(fetchPublicPage('http://127.0.0.1:5173/recipes')).rejects.toMatchObject({
			key: 'url_not_allowed'
		});
		await expect(fetchPublicPage('http://localhost/')).rejects.toMatchObject({
			key: 'url_not_allowed'
		});
		await expect(fetchPublicPage('http://[::1]/')).rejects.toMatchObject({
			key: 'url_not_allowed'
		});
	});

	it('rejects invalid URLs', async () => {
		await expect(fetchPublicPage('javascript:alert(1)')).rejects.toMatchObject({
			key: 'url_invalid'
		});
	});
});

describe('fetchPublicPage when the site refuses the request', () => {
	afterEach(() => vi.unstubAllGlobals());

	it.each([403, 401])('reports page_blocked for status %i', async (status) => {
		vi.stubGlobal('fetch', async () => new Response('Forbidden', { status }));
		// An IP literal is used so no DNS lookup is needed.
		await expect(fetchPublicPage('https://93.184.216.34/recipe/')).rejects.toMatchObject({
			key: 'page_blocked'
		});
	});

	it('reports page_unreachable for other error statuses', async () => {
		vi.stubGlobal('fetch', async () => new Response('Missing', { status: 404 }));
		await expect(fetchPublicPage('https://93.184.216.34/recipe/')).rejects.toMatchObject({
			key: 'page_unreachable'
		});
	});
});
