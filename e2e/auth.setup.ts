import { test as setup } from '@playwright/test';

/**
 * Deployed runs only: signs in once through the app's own sign-in form, as the test user, and
 * saves the session so every test starts signed in. Locally sign-in is off, so this does not run.
 */
setup('sign in as the test user', async ({ page }) => {
	const email = process.env.E2E_EMAIL;
	const password = process.env.E2E_PASSWORD;
	if (!email || !password) throw new Error('E2E_EMAIL and E2E_PASSWORD must be set');

	await page.goto('/signin');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).tap();
	await page.waitForURL((url) => !url.pathname.startsWith('/signin'));

	await page.context().storageState({ path: '.emulators/deployed-auth.json' });
});
