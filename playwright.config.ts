import { defineConfig, devices } from '@playwright/test';

const port = 5174;
// Set by npm run test:e2e:deployed: the tests then run against a deployed throwaway stage.
const deployedUrl = process.env.E2E_BASE_URL;
const signedIn = '.emulators/deployed-auth.json';

/**
 * End-to-end tests: a real browser, sized and touch-enabled like a phone, driving the built app
 * as a person would. Two targets, same tests:
 *   - local (npm run test:e2e, npm run build): the built app with sign-in and machine translation
 *     off, on the same AWS store code as production, through DynamoDB Local and an S3 emulator
 *     that scripts/local-stack.ts starts and stops. Nothing reaches AWS.
 *   - deployed (npm run test:e2e:deployed): the e2e stage, signed in as a test user.
 */
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	globalTeardown: './e2e/teardown.ts',
	use: {
		baseURL: deployedUrl ?? `http://127.0.0.1:${port}`,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: deployedUrl
		? [
				{ name: 'setup', testMatch: /auth\.setup\.ts/ },
				{
					name: 'phone',
					dependencies: ['setup'],
					use: { ...devices['Pixel 7'], storageState: signedIn }
				}
			]
		: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
	webServer: deployedUrl
		? undefined
		: {
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
