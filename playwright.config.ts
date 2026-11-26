import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Each run gets a new data folder, so the tests never read or change ./data.
const dataDir = mkdtempSync(path.join(tmpdir(), 'recipes-e2e-'));
const port = 5174;

/**
 * End-to-end tests: a real browser, sized and touch-enabled like a phone, driving the app
 * as a person would. Sign-in is off and the store is the local file store, both only for
 * this run. Run with `npm run test:e2e`.
 */
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
	webServer: {
		command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
		url: `http://127.0.0.1:${port}/recipes`,
		reuseExistingServer: false,
		env: { AUTH: 'off', STORE: 'file', RECIPE_DATA_DIR: dataDir }
	}
});
