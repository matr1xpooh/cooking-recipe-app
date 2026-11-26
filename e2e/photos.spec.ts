import { test, expect } from '@playwright/test';
import { addRecipe, PNG } from './helpers';

test('a phone user adds a photo, then adds more from its edit menu', async ({ page }) => {
	await addRecipe(page, 'Photo soup');

	await page.getByRole('button', { name: 'Add a picture' }).tap();
	await page
		.locator('input[type="file"][accept="image/png,image/jpeg"]')
		.setInputFiles({ name: 'dish.png', mimeType: 'image/png', buffer: PNG });
	await expect(page.getByRole('img', { name: 'Recipe screenshot' })).toBeVisible();

	await page.getByRole('button', { name: 'Edit image' }).tap();
	await expect(page.getByRole('button', { name: 'Add more pictures' })).toBeVisible();
});
