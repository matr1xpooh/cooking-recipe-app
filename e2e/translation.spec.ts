import { test, expect } from '@playwright/test';
import { addRecipe } from './helpers';

test('switching to Spanish shows the Spanish page; translation is off in tests', async ({
	page
}) => {
	await addRecipe(page, 'Sopa test');

	await page.getByRole('link', { name: 'ES', exact: true }).tap();
	await expect(page.getByRole('heading', { name: 'Ingredientes' })).toBeVisible();
	// TRANSLATE=off (set in playwright.config.ts): the page says so and shows the original text.
	await expect(page.getByText('No se pudo traducir ahora.')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1, name: 'Sopa test' })).toBeVisible();
});
