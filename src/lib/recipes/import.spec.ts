import { describe, it, expect } from 'vitest';
import { extractRecipe, pageTitle } from './import';

function page(jsonLd: string, head = '<title>Page</title>'): string {
	return `<html><head>${head}<script type="application/ld+json">${jsonLd}</script></head><body></body></html>`;
}

describe('extractRecipe', () => {
	it('reads a top-level Recipe node', () => {
		const html = page(
			JSON.stringify({
				'@context': 'https://schema.org',
				'@type': 'Recipe',
				name: 'Pancakes',
				recipeIngredient: ['1 cup flour', '1 egg'],
				recipeInstructions: ['Mix the batter.', 'Fry until golden.']
			})
		);
		expect(extractRecipe(html)).toEqual({
			title: 'Pancakes',
			ingredients: ['1 cup flour', '1 egg'],
			steps: ['Mix the batter.', 'Fry until golden.']
		});
	});

	it('finds a Recipe inside @graph when @type is an array', () => {
		const html = page(
			JSON.stringify({
				'@graph': [
					{ '@type': 'WebSite', name: 'Site' },
					{
						'@type': ['Thing', 'Recipe'],
						name: 'Soup',
						recipeIngredient: 'water',
						recipeInstructions: 'Boil'
					}
				]
			})
		);
		expect(extractRecipe(html)).toEqual({ title: 'Soup', ingredients: ['water'], steps: ['Boil'] });
	});

	it('flattens HowToStep and HowToSection instructions', () => {
		const html = page(
			JSON.stringify({
				'@type': 'Recipe',
				name: 'Cake',
				recipeIngredient: ['flour'],
				recipeInstructions: [
					{
						'@type': 'HowToSection',
						name: 'Batter',
						itemListElement: [{ '@type': 'HowToStep', text: 'Whisk.' }]
					},
					{ '@type': 'HowToStep', name: 'Bake for 30 min' }
				]
			})
		);
		expect(extractRecipe(html)?.steps).toEqual(['Whisk.', 'Bake for 30 min']);
	});

	it('strips HTML tags and whitespace from text', () => {
		const html = page(
			JSON.stringify({
				'@type': 'Recipe',
				name: '  <b>Tea</b>  ',
				recipeIngredient: ['<p>water</p>'],
				recipeInstructions: []
			})
		);
		expect(extractRecipe(html)).toEqual({ title: 'Tea', ingredients: ['water'], steps: [] });
	});

	it('skips malformed JSON-LD blocks and keeps looking', () => {
		const html =
			`<script type="application/ld+json">{broken</script>` +
			page(JSON.stringify({ '@type': 'Recipe', name: 'OK', recipeIngredient: ['salt'] }));
		expect(extractRecipe(html)?.title).toBe('OK');
	});

	it('returns null when the page has no recipe data', () => {
		expect(extractRecipe(page(JSON.stringify({ '@type': 'Article', name: 'News' })))).toBeNull();
		expect(extractRecipe('<html><body>just text</body></html>')).toBeNull();
	});

	it('returns null for a Recipe with neither ingredients nor steps', () => {
		expect(extractRecipe(page(JSON.stringify({ '@type': 'Recipe', name: 'Empty' })))).toBeNull();
	});
});

describe('pageTitle', () => {
	it('prefers og:title', () => {
		expect(pageTitle('<meta property="og:title" content="Shared Title"><title>Other</title>')).toBe(
			'Shared Title'
		);
	});

	it('falls back to <title>', () => {
		expect(pageTitle('<title> Plain Page </title>')).toBe('Plain Page');
	});
});
