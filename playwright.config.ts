import { defineConfig, devices } from '@playwright/test';

const port = 5174;

/**
 * End-to-end tests: a real browser, sized and touch-enabled like a phone, driving the built app
 * as a person would. For this run only, sign-in and machine translation are off. The app uses
 * the same AWS store as production, through DynamoDB Local and an S3 emulator that
 * scripts/local-stack.ts starts and stops, so nothing reaches AWS and the emulators keep nothing.
 * Run with `npm run test:e2e`, which builds the app first.
 */
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	globalTeardown: './e2e/teardown.ts',
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
	webServer: {
		command: `tsx scripts/local-stack.ts -- vite preview --host 127.0.0.1 --port ${port} --strictPort`,
		url: `http://127.0.0.1:${port}/recipes`,
		reuseExistingServer: false,
		env: {
			AUTH: 'off',
			SESSION_SECRET: 'e2e-only-secret-that-is-at-least-32-chars',
			TRANSLATE: 'off'
		}
	}
});
