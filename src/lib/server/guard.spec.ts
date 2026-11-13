import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { decideAccess, isPublicPath, PUBLIC_TRANSLATE_PATH } from './access';
import { fileStore, getStore } from './store';

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

/** The only API routes a signed-out visitor may read (GET). Anything new must be added here on purpose. */
const PUBLIC_API_READS = [
	'/api/recipes',
	'/api/recipes/example',
	'/api/recipes/example/images/example',
	'/api/recipes/example/translations/example'
];

describe('every API route needs a signed-in user, except the recipe reads', () => {
	it('finds the API routes', async () => {
		const routes = await apiRoutePaths();
		expect(routes.length).toBeGreaterThan(0);
	});

	it('answers 401 to a signed-out write on every API route except the public translate', async () => {
		for (const pathname of await apiRoutePaths()) {
			if (pathname === PUBLIC_TRANSLATE_PATH) continue;
			expect(
				decideAccess({ pathname, method: 'POST', signedIn: false, authDisabled: false }),
				pathname
			).toBe('unauthorized');
		}
	});

	it('opens to a signed-out reader only the listed recipe reads', async () => {
		const opened: string[] = [];
		for (const pathname of await apiRoutePaths()) {
			if (
				decideAccess({ pathname, method: 'GET', signedIn: false, authDisabled: false }) === 'allow'
			) {
				opened.push(pathname);
			}
		}
		expect(opened.sort()).toEqual([...PUBLIC_API_READS].sort());
	});

	it('opens to a signed-out POST only the public translate route', async () => {
		const opened: string[] = [];
		for (const pathname of await apiRoutePaths()) {
			if (
				decideAccess({ pathname, method: 'POST', signedIn: false, authDisabled: false }) === 'allow'
			) {
				opened.push(pathname);
			}
		}
		expect(opened).toEqual([PUBLIC_TRANSLATE_PATH]);
	});

	it('never lists an API route as public', async () => {
		for (const pathname of await apiRoutePaths()) {
			expect(isPublicPath(pathname), pathname).toBe(false);
		}
	});
});

describe('STORE=aws never touches the local data folder', () => {
	const saved = { ...process.env };
	beforeEach(() => {
		process.env.STORE = 'aws';
		process.env.TABLE_NAME = 'guard-table';
		process.env.BUCKET_NAME = 'guard-bucket';
		process.env.RECIPE_DATA_DIR = path.resolve('does-not-exist-guard');
	});
	afterEach(() => {
		for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
		Object.assign(process.env, saved);
	});

	it('selects a store whose every operation is not a file-store operation', () => {
		const store = getStore();
		expect(store).not.toBe(fileStore);
		for (const key of Object.keys(fileStore) as (keyof typeof fileStore)[]) {
			expect(store[key], key).not.toBe(fileStore[key]);
		}
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
