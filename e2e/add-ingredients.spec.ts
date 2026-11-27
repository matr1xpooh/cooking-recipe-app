import { test, expect } from '@playwright/test';

test('a recipe saved without ingredients gets an ingredient slot to add them later', async ({
	page
}) => {
	await page.goto('/recipes');
	await page.waitForLoadState('networkidle');

	await page.getByRole('link', { name: 'Add recipe' }).tap();
	await page.getByLabel('Title', { exact: true }).fill('Plain rice');
	await page
		.getByRole('textbox', { name: 'Steps (one per line)', exact: true })
		.fill('Boil the rice');
	await page.getByRole('button', { name: 'Save recipe' }).tap();

	await page.waitForURL((url) => url.pathname === '/recipes');
	await page.getByRole('link', { name: 'Plain rice' }).tap();
	await expect(page.getByRole('heading', { level: 1, name: 'Plain rice' })).toBeVisible();

	// The ingredients section has no lines yet, so its add slot comes first on the page.
	await page.getByRole('button', { name: 'Add…' }).first().tap();
	await page.getByRole('button', { name: 'Ingredient', exact: true }).tap();
	await page.getByRole('textbox', { name: 'Add an ingredient' }).fill('200 g rice');
	await page.getByRole('textbox', { name: 'Add an ingredient' }).press('Enter');

	await expect(page.getByText('200 g rice')).toBeVisible();
});
