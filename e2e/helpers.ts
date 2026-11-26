import { expect, type Page } from '@playwright/test';

/** Adds a recipe the way a person does: from the list, through the form, then opens it. */
export async function addRecipe(
	page: Page,
	title: string,
	ingredients = 'water\nsalt'
): Promise<void> {
	await page.goto('/recipes');
	await page.waitForLoadState('networkidle');

	await page.getByRole('link', { name: 'Add recipe' }).tap();
	await page.getByLabel('Title', { exact: true }).fill(title);
	await page.getByRole('textbox', { name: 'Ingredients', exact: true }).fill(ingredients);
	await page
		.getByRole('textbox', { name: 'Steps (one per line)', exact: true })
		.fill('Boil the water\nAdd salt');
	await page.getByRole('button', { name: 'Save recipe' }).tap();

	// Saving returns to the list; the new recipe is opened from there.
	await page.waitForURL((url) => url.pathname === '/recipes');
	await page.getByRole('link', { name: title }).tap();
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** A 1 by 1 pixel PNG, small enough to keep in the test. */
export const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64'
);
