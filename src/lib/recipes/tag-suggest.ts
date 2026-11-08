import type { Tag } from './recipe';

/**
 * Words that suggest a tag. A word ending in '*' matches as a stem (for Russian,
 * whose endings change); other words match whole, with an optional plural 's' or 'es'.
 */
const KEYWORDS: Record<Tag, string[]> = {
	meat: [
		'beef',
		'pork',
		'lamb',
		'veal',
		'steak',
		'bacon',
		'ham',
		'sausage',
		'mince',
		'meatball',
		'carne',
		'ternera',
		'cerdo',
		'cordero',
		'salchicha',
		'carn',
		'porc',
		'xai',
		'говяд*',
		'свин*',
		'баран*',
		'телят*',
		'колбас*',
		'фарш*',
		'мяс*'
	],
	poultry: [
		'chicken',
		'turkey',
		'duck',
		'goose',
		'pollo',
		'pavo',
		'pato',
		'pollastre',
		'курин*',
		'курица',
		'индейк*',
		'утк*',
		'цыплен*'
	],
	fish: [
		'fish',
		'salmon',
		'tuna',
		'cod',
		'shrimp',
		'prawn',
		'mussel',
		'squid',
		'anchovy',
		'sardine',
		'pescado',
		'salmón',
		'bacalao',
		'gamba',
		'pez',
		'peix',
		'рыб*',
		'лосос*',
		'креветк*',
		'тунец',
		'треск*',
		'кальмар*'
	],
	vegetarian: [
		'tofu',
		'lentil',
		'chickpea',
		'halloumi',
		'tempeh',
		'vegetarian',
		'lentejas',
		'garbanzo',
		'чечевиц*',
		'нут'
	],
	soup: ['soup', 'broth', 'stock', 'bouillon', 'sopa', 'caldo', 'brou', 'суп*', 'бульон*'],
	dessert: [
		'cake',
		'cookie',
		'pudding',
		'ice cream',
		'dessert',
		'custard',
		'mousse',
		'tart',
		'postre',
		'pastel',
		'helado',
		'flan',
		'tarta',
		'galleta',
		'pastís',
		'десерт*',
		'торт*',
		'мороженое'
	],
	baking: [
		'flour',
		'bread',
		'dough',
		'yeast',
		'baking powder',
		'sourdough',
		'harina',
		'levadura',
		'masa',
		'farina',
		'llevat',
		'мук*',
		'тесто',
		'дрожж*',
		'хлеб*',
		'выпечк*'
	],
	drinks: [
		'tea',
		'coffee',
		'juice',
		'smoothie',
		'wine',
		'beer',
		'cocktail',
		'lemonade',
		'milkshake',
		'té',
		'café',
		'cafe',
		'zumo',
		'vino',
		'cerveza',
		'чай',
		'кофе',
		'сок',
		'вино',
		'пиво',
		'коктейл*',
		'смузи'
	]
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternFor(keyword: string): RegExp {
	const start = '(?<!\\p{L})';
	if (keyword.endsWith('*')) {
		return new RegExp(`${start}${escapeRegExp(keyword.slice(0, -1))}`, 'iu');
	}
	return new RegExp(`${start}${escapeRegExp(keyword)}(?:e?s)?(?!\\p{L})`, 'iu');
}

const PATTERNS: [Tag, RegExp[]][] = (Object.keys(KEYWORDS) as Tag[]).map((tag) => [
	tag,
	KEYWORDS[tag].map(patternFor)
]);

/** Tags whose words appear in the text, in tag order. Suggestions only; nothing is applied. */
export function suggestTags(text: string): Tag[] {
	return PATTERNS.filter(([, patterns]) => patterns.some((p) => p.test(text))).map(([tag]) => tag);
}
