import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Each run gets a new data folder. The global teardown deletes it, so the tests never read or
// change ./data and leave nothing behind.
// Playwright loads this file in several processes; the first one sets the folder, the rest reuse it.
process.env.E2E_DATA_DIR ??= mkdtempSync(path.join(tmpdir(), 'recipes-e2e-'));
const dataDir = process.env.E2E_DATA_DIR;
const port = 5174;

/**
 * End-to-end tests: a real browser, sized and touch-enabled like a phone, driving the app
 * as a person would. Sign-in is off and the store is the local file store, both only for
 * this run. The tests run against a file-store build of the app. The server gets no AWS credentials, so it cannot call AWS. Run with `npm run test:e2e`.
 */
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	globalTeardown: './e2e/global-teardown.ts',
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
	webServer: {
		// Serves the built app (see test:e2e in package.json), not the dev server.
		command: `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
		url: `http://127.0.0.1:${port}/recipes`,
		reuseExistingServer: false,
		env: {
			AUTH: 'off',
			SESSION_SECRET: 'e2e-only-secret-that-is-at-least-32-chars',
			TRANSLATE: 'off',
			STORE: 'file',
			RECIPE_DATA_DIR: dataDir,
			E2E_DATA_DIR: dataDir,
			// Machine translation is off, and no credentials or config files are given, so nothing reaches AWS.
			AWS_ACCESS_KEY_ID: '',
			AWS_SECRET_ACCESS_KEY: '',
			AWS_SESSION_TOKEN: '',
			AWS_PROFILE: 'none-e2e',
			AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
			AWS_CONFIG_FILE: '/dev/null',
			AWS_EC2_METADATA_DISABLED: 'true'
		}
	}
});
