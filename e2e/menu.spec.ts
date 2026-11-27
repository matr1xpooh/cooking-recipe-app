import { test, expect } from '@playwright/test';
import { addRecipe, moreItem, openMenu } from './helpers';

test('the normal recipe view has no edit controls until Edit recipe is chosen', async ({
	page
}) => {
	await addRecipe(page, 'Menu soup', '200 g harina\n3 huevos');

	await expect(page.getByRole('button', { name: 'Add…' })).toHaveCount(0);

	await moreItem(page, 'Edit recipe');
	await expect(page.getByRole('button', { name: 'Add…' }).first()).toBeVisible();

	await page.getByRole('button', { name: 'Done', exact: true }).tap();
	await expect(page.getByRole('button', { name: 'Add…' })).toHaveCount(0);
});

test('the Menu holds the language and the text size', async ({ page }) => {
	await page.goto('/recipes');
	await page.waitForLoadState('networkidle');

	await openMenu(page);
	await expect(page.getByRole('link', { name: 'ES', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Larger text' })).toBeVisible();
});
