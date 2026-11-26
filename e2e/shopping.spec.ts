import { test, expect } from '@playwright/test';
import { addRecipe } from './helpers';

test('a phone user adds a recipe to the shopping list', async ({ page }) => {
	await addRecipe(page, 'Shop soup');

	await page.getByRole('button', { name: '+ Shopping list' }).tap();
	await expect(page).toHaveURL(/\/shopping$/);
	await expect(page.getByText('Shop soup').first()).toBeVisible();
});
