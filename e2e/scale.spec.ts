import { test, expect, type Page } from '@playwright/test';
import { addRecipe, moreItem } from './helpers';

/** An ingredient line: its list item, which also holds the "+" that adds a line after it. */
function line(page: Page, text: string) {
	return page.getByRole('listitem').filter({ hasText: text });
}

test('a phone user scales the ingredients, sets one quantity and resets', async ({ page }) => {
	await addRecipe(page, 'Scale cake', '200 g harina\n3 huevos\n1/2 cup leche');

	// Closed by default: the recipe reads as it was written.
	await expect(line(page, '200 g harina')).toBeVisible();

	await moreItem(page, 'Scale');
	await page.getByRole('button', { name: '×2', exact: true }).tap();
	await expect(line(page, '400 g harina')).toBeVisible();
	await expect(line(page, '6 huevos')).toBeVisible();
	await expect(line(page, '1 cup leche')).toBeVisible();

	// Tap one quantity and type the new amount: the other lines follow.
	await page.getByRole('button', { name: '400 g harina', exact: true }).tap();
	await page.getByRole('textbox', { name: 'New quantity', exact: true }).fill('180');
	await page.getByRole('button', { name: 'Apply', exact: true }).tap();
	await expect(line(page, '180 g harina')).toBeVisible();
	await expect(line(page, '2.7 huevos')).toBeVisible();
	await expect(line(page, '1/2 cup leche')).toBeVisible();

	await page.getByRole('button', { name: 'Reset', exact: true }).tap();
	await expect(line(page, '200 g harina')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Reset', exact: true })).toHaveCount(0);
});

test('a scaled recipe goes on the shopping list at that scale', async ({ page }) => {
	await addRecipe(page, 'Scale soup', '200 g harina');

	await moreItem(page, 'Scale');
	await page.getByRole('button', { name: '×2', exact: true }).tap();
	await page.getByRole('button', { name: '+ Shopping list' }).tap();

	await expect(page).toHaveURL(/\/shopping$/);
	await expect(line(page, '×2')).toBeVisible();
	await expect(page.getByText('400 g', { exact: false }).first()).toBeVisible();
});
