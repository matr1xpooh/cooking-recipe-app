import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { decideAccess, isPublicPath } from './access';
import { awsStore, fileStore, getStore } from './store';

/**
 * Checks that must hold before the app goes to AWS. They read the code's shape, so a
 * new API route or a stray local-file call fails the build instead of reaching users.
 */

const ROUTES = path.resolve('src/routes');

/** Every +server.ts route file, as the URL path it serves (with [params] filled in). */
async function apiRoutePaths(
	dir = path.join(ROUTES, 'api'),
	out: string[] = []
): Promise<string[]> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) await apiRoutePaths(full, out);
		else if (entry.name === '+server.ts') {
			const url = '/' + path.relative(ROUTES, path.dirname(full)).split(path.sep).join('/');
			out.push(url.replace(/\[[^\]]+\]/g, 'example'));
		}
	}
	return out;
}

describe('every API route needs a signed-in user', () => {
	it('finds the API routes', async () => {
		const routes = await apiRoutePaths();
		expect(routes.length).toBeGreaterThan(0);
	});

	it('answers 401 to a signed-out write on every API route', async () => {
		for (const pathname of await apiRoutePaths()) {
			expect(
				decideAccess({ pathname, method: 'POST', signedIn: false, authDisabled: false }),
				pathname
			).toBe('unauthorized');
		}
	});

	it('opens no API route to a signed-out reader', async () => {
		for (const pathname of await apiRoutePaths()) {
			expect(
				decideAccess({ pathname, method: 'GET', signedIn: false, authDisabled: false }),
				pathname
			).toBe('unauthorized');
		}
	});

	it('never lists an API route as public', async () => {
		for (const pathname of await apiRoutePaths()) {
			expect(isPublicPath(pathname), pathname).toBe(false);
		}
	});
});

describe('the AWS store never touches the local data folder', () => {
	const saved = { ...process.env };
	beforeEach(() => {
		process.env.TABLE_NAME = 'guard-table';
		process.env.BUCKET_NAME = 'guard-bucket';
		process.env.RECIPE_DATA_DIR = path.resolve('does-not-exist-guard');
	});
	afterEach(() => {
		for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
		Object.assign(process.env, saved);
	});

	it('the AWS store has no operation that is a file-store operation', () => {
		// The build picks the store (vite.config.ts); tests run as a file build, so the AWS store is built here directly.
		const store = awsStore();
		expect(store).not.toBe(fileStore);
		for (const key of Object.keys(fileStore) as (keyof typeof fileStore)[]) {
			expect(store[key], key).not.toBe(fileStore[key]);
		}
	});

	it('this test build uses the file store, as chosen by vite.config.ts', () => {
		expect(getStore()).toBe(fileStore);
	});

	it('the AWS store module does not import any local-file code', async () => {
		const source = await readFile(path.resolve('src/lib/server/aws-store.ts'), 'utf8');
		// Runtime imports only: "import type" lines are erased and cannot touch the disk.
		const imports = [...source.matchAll(/^import\s+(?!type\s)[\s\S]*?from\s+'([^']+)'/gm)].map(
			(m) => m[1]
		);
		const local = imports.filter(
			(name) =>
				name.startsWith('node:fs') ||
				name.includes('recipe-data') ||
				name.includes('translation-overrides') ||
				name.includes('state-file')
		);
		expect(local).toEqual([]);
	});
});
