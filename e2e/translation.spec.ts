import { test, expect } from '@playwright/test';
import { addRecipe } from './helpers';

test('switching to Spanish shows the Spanish page and keeps the recipe', async ({ page }) => {
	// Translation would call AWS Translate. The browser's request is answered here instead, so
	// no request reaches the server's AWS code.
	await page.route('**/api/recipes/translate', async (route) => {
		const body = route.request().postDataJSON() as { items: { text: string }[] };
		await route.fulfill({
			json: { items: body.items.map((item) => ({ text: item.text, failed: false })) }
		});
	});

	await addRecipe(page, 'Sopa test');

	await page.getByRole('link', { name: 'ES', exact: true }).tap();
	await expect(page.getByRole('heading', { name: 'Ingredientes' })).toBeVisible();
	await expect(page.getByText('Traduciendo…')).toHaveCount(0, { timeout: 30000 });
	await expect(page.getByRole('heading', { level: 1, name: 'Sopa test' })).toBeVisible();
});
