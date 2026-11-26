import { test, expect } from '@playwright/test';

test('a phone user adds a recipe, cooks it and shares it', async ({ page }) => {
	await page.goto('/recipes');
	await page.waitForLoadState('networkidle');

	await page.getByRole('link', { name: 'Add recipe' }).tap();
	await page.getByLabel('Title', { exact: true }).fill('Test soup');
	await page.getByRole('textbox', { name: 'Ingredients', exact: true }).fill('water\nsalt');
	await page
		.getByRole('textbox', { name: 'Steps (one per line)', exact: true })
		.fill('Boil the water\nAdd salt');
	await page.getByRole('button', { name: 'Save recipe' }).tap();

	// Saving returns to the list; the new recipe is opened from there.
	await page.waitForURL((url) => url.pathname === '/recipes');
	await page.getByRole('link', { name: 'Test soup' }).tap();
	await expect(page.getByRole('heading', { level: 1, name: 'Test soup' })).toBeVisible();

	await page.getByRole('link', { name: 'Cook' }).tap();
	await expect(page.getByText('Boil the water')).toBeVisible();
	await page.getByRole('link', { name: 'Close' }).tap();

	await page.getByRole('button', { name: 'Share' }).tap();
	await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
});
