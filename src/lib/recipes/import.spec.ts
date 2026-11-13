import { describe, it, expect } from 'vitest';
import {
	pageImage,
	extractRecipe,
	extractYouTubeDescription,
	decodeEntities,
	isYouTubeUrl,
	pageTitle,
	parseDescription
} from './import';

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

describe('parseDescription', () => {
	const description = [
		'Рубрика «Не слипнется!»',
		'Пышные домашние оладьи с кремом из халвы.',
		'3 порции ',
		'',
		'Цены актуальны на март 2022 года',
		'',
		'Ингредиенты ',
		'',
		'Кефир 300 мл (30 р.) («Ашан», 930 мл = 91 р.)',
		'Сода ½ ч. ложки (1 р.) («Ашан», 500 г = 31 р.)',
		'Сахар 1 ст. ложка (1 р.) («Ашан», 1 кг = 53 р.)',
		'Мука 200 г (12 р.) («Ашан», 1 кг = 60 р.)',
		'Соль щепотка ',
		'Растительное масло (подсолнечное) 20 мл (2 р.) («Ашан», 1 л = 110 р.)',
		'Соус:',
		'Халва арахисовая 150 г (39 р.) («Ашан», 180 г = 47 р.)',
		'Сметана 150 г (40 р.) («Ашан», 315 г = 84 р.)',
		'',
		'Итого: 3 порции оладий с халвичным соусом = 125 р.',
		'',
		'Приготовление',
		'1. В кефир всыпать соду, перемешать венчиком и дать постоять 3 минуты.',
		'2. В кефир добавить щепотку соли и сахар. Затем всыпать порциями муку.',
		'3. На большую сковороду налить 20 мл растительного масла и обжаривать.',
		'Соус:',
		'4. Халву поломать на кусочки и отправить в куттер.',
		'Сервировка',
		'5. Оладьи переложить на порционные тарелки.',
		'',
		' Приятного аппетита!'
	].join('\n');

	it('splits a Russian description into ingredients and steps', () => {
		const parsed = parseDescription(description);
		expect(parsed?.ingredients).toEqual([
			'Кефир 300 мл',
			'Сода ½ ч. ложки',
			'Сахар 1 ст. ложка',
			'Мука 200 г',
			'Соль щепотка',
			'Растительное масло (подсолнечное) 20 мл',
			'Халва арахисовая 150 г',
			'Сметана 150 г'
		]);
		expect(parsed?.steps).toEqual([
			'В кефир всыпать соду, перемешать венчиком и дать постоять 3 минуты.',
			'В кефир добавить щепотку соли и сахар. Затем всыпать порциями муку.',
			'На большую сковороду налить 20 мл растительного масла и обжаривать.',
			'Халву поломать на кусочки и отправить в куттер.',
			'Сервировка',
			'Оладьи переложить на порционные тарелки.'
		]);
	});

	it('handles English headings', () => {
		const parsed = parseDescription(
			'Ingredients:\n- 2 eggs\n- 1 cup flour\n\nSteps:\n1. Whisk\n2. Bake'
		);
		expect(parsed).toEqual({
			ingredients: ['- 2 eggs', '- 1 cup flour'],
			steps: ['Whisk', 'Bake']
		});
	});

	it('returns null when there are no recognisable headings', () => {
		expect(parseDescription('Subscribe for more videos! Link in bio.')).toBeNull();
	});

	it('does not treat words that merely start with a heading as one', () => {
		expect(parseDescription('Ingredientsfree snacks are great')).toBeNull();
	});
});

describe('extractYouTubeDescription', () => {
	it('reads and unescapes the embedded description', () => {
		const html =
			'<script>var x = {"shortDescription":"Line one\\nSteps \\"quoted\\"","other":1};</script>';
		expect(extractYouTubeDescription(html)).toBe('Line one\nSteps "quoted"');
	});

	it('returns null when the page has no description', () => {
		expect(extractYouTubeDescription('<html></html>')).toBeNull();
	});
});

describe('isYouTubeUrl', () => {
	it('recognises YouTube hosts only', () => {
		expect(isYouTubeUrl(new URL('https://www.youtube.com/watch?v=abc'))).toBe(true);
		expect(isYouTubeUrl(new URL('https://youtu.be/abc'))).toBe(true);
		expect(isYouTubeUrl(new URL('https://notyoutube.com/x'))).toBe(false);
		expect(isYouTubeUrl(new URL('https://example.com/youtube.com'))).toBe(false);
	});
});

describe('pageTitle YouTube suffix', () => {
	it('drops the " - YouTube" suffix', () => {
		expect(pageTitle('<title>Pancakes - YouTube</title>')).toBe('Pancakes');
	});
});

describe('extractRecipe with raw control characters', () => {
	it('reads a recipe whose JSON-LD has a raw tab inside a string', () => {
		const json =
			'{"@type":"Recipe","name":"Beef\tand broccoli","recipeIngredient":["10 oz. beef"],"recipeInstructions":["Stir."]}';
		const html = `<html><script type="application/ld+json">${json}</script></html>`;
		expect(extractRecipe(html)).toEqual({
			title: 'Beef and broccoli',
			ingredients: ['10 oz. beef'],
			steps: ['Stir.']
		});
	});
});

describe('picture URLs', () => {
	it('reads the image from the recipe data, in any of its shapes', () => {
		const html = (image: string) =>
			`<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'X', recipeIngredient: ['a'], image })}</script>`;
		expect(extractRecipe(html('https://e.com/a.jpg'))?.image).toBe('https://e.com/a.jpg');
		expect(extractRecipe(html('/relative.png'))?.image).toBe('/relative.png');
		expect(
			extractRecipe(
				`<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'X', recipeIngredient: ['a'], image: { url: 'https://e.com/o.jpg' } })}</script>`
			)?.image
		).toBe('https://e.com/o.jpg');
	});

	it('falls back to og:image in either attribute order', () => {
		expect(pageImage('<meta property="og:image" content="https://e.com/p.jpg">')).toBe(
			'https://e.com/p.jpg'
		);
		expect(pageImage('<meta content="https://e.com/q.jpg" property="og:image">')).toBe(
			'https://e.com/q.jpg'
		);
		expect(pageImage('<title>none</title>')).toBeUndefined();
	});
});

describe('parseDescription drops credits after the recipe', () => {
	it('keeps music and link lines out of the ingredients', () => {
		const parsed = parseDescription(
			'Ingredients -\n2 eggs\n1 cup flour\n\nSteps:\nMix.\n\nMusic in this video\nhttps://example.com/track\nSong - Something\nArtist - Someone'
		);
		expect(parsed).toEqual({ ingredients: ['2 eggs', '1 cup flour'], steps: ['Mix.'] });
	});
});

describe('decodeEntities', () => {
	it('turns escaped apostrophes, quotes and ampersands into characters', () => {
		expect(decodeEntities('If you don&#39;t have a gas burner')).toBe(
			"If you don't have a gas burner"
		);
		expect(decodeEntities('salt &amp; pepper &quot;fresh&quot;')).toBe('salt & pepper "fresh"');
		expect(decodeEntities('&#x27;quoted&#x27; &lt;b&gt;')).toBe("'quoted' <b>");
	});

	it('leaves unknown or invalid references as they are', () => {
		expect(decodeEntities('&bogus; &#0; &#99999999;')).toBe('&bogus; &#0; &#99999999;');
	});
});
