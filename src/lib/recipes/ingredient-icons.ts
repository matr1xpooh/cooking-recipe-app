/*
 * Icons for ingredient lines. An icon is an emoji at the start of the line, either typed by the
 * user (or imported) or picked here from a word in the line. Picked icons are for display only: the
 * recipe text is not changed, so editing, translation and sharing are unaffected.
 */

/** Words are compared without accents and in lower case: "tomàquet" is "tomaquet". */
function normal(word: string): string {
	return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** One icon and the words that pick it, in the four site languages. */
const ICONS: { emoji: string; words: string[] }[] = [
	{
		emoji: '🦐',
		words: ['shrimp', 'prawn', 'prawns', 'gambas', 'gamba', 'gambes', 'креветки', 'креветка']
	},
	{ emoji: '🦑', words: ['squid', 'calamar', 'calamares', 'calamars', 'кальмар', 'кальмары'] },
	{
		emoji: '🍋',
		words: [
			'lemon',
			'lemons',
			'limón',
			'limon',
			'limones',
			'llimona',
			'llimones',
			'лимон',
			'лимоны'
		]
	},
	{
		emoji: '🍅',
		words: [
			'tomato',
			'tomatoes',
			'tomate',
			'tomates',
			'tomàquet',
			'tomàquets',
			'помидор',
			'помидоры',
			'томат',
			'томаты'
		]
	},
	{ emoji: '🧄', words: ['garlic', 'ajo', 'ajos', 'alls', 'чеснок'] },
	{ emoji: '🧅', words: ['onion', 'onions', 'cebolla', 'cebollas', 'ceba', 'cebes', 'лук'] },
	{ emoji: '🥚', words: ['egg', 'eggs', 'huevo', 'huevos', 'ou', 'ous', 'яйцо', 'яйца'] },
	{ emoji: '🧀', words: ['cheese', 'queso', 'formatge', 'сыр'] },
	{ emoji: '🥛', words: ['milk', 'leche', 'llet', 'молоко'] },
	{
		emoji: '🥔',
		words: ['potato', 'potatoes', 'patata', 'patatas', 'patates', 'картофель', 'картошка']
	},
	{ emoji: '🍚', words: ['rice', 'arroz', 'arròs', 'рис'] },
	{ emoji: '🍝', words: ['pasta', 'pasta', 'паста', 'макароны'] },
	{
		emoji: '🥩',
		words: ['beef', 'meat', 'carne', 'ternera', 'carn', 'vedella', 'говядина', 'мясо']
	},
	{ emoji: '🍗', words: ['chicken', 'pollo', 'pollastre', 'pollastres', 'курица', 'курятина'] },
	{ emoji: '🐟', words: ['fish', 'pescado', 'peix', 'рыба'] },
	{ emoji: '🧈', words: ['butter', 'mantequilla', 'mantega', 'сливочное'] },
	{ emoji: '🍞', words: ['bread', 'pan', 'pa', 'хлеб'] },
	{
		emoji: '🥕',
		words: ['carrot', 'carrots', 'zanahoria', 'zanahorias', 'pastanaga', 'pastanagues', 'морковь']
	},
	{
		emoji: '🍄',
		words: [
			'mushroom',
			'mushrooms',
			'champiñón',
			'champiñones',
			'setas',
			'xampinyons',
			'bolets',
			'грибы',
			'гриб'
		]
	},
	{
		emoji: '🫑',
		words: ['pepper', 'peppers', 'pimiento', 'pimientos', 'pebrot', 'pebrots', 'перец']
	},
	{ emoji: '🧂', words: ['salt', 'sal', 'sal', 'соль'] },
	{ emoji: '🍬', words: ['sugar', 'azúcar', 'azucar', 'sucre', 'сахар'] },
	{ emoji: '🌾', words: ['flour', 'harina', 'farina', 'мука'] },
	{ emoji: '🍯', words: ['honey', 'miel', 'mel', 'мёд'] },
	{ emoji: '🌿', words: ['parsley', 'perejil', 'julivert', 'петрушка'] },
	{ emoji: '🍫', words: ['chocolate', 'xocolata', 'шоколад'] },
	{ emoji: '🥓', words: ['bacon', 'panceta', 'cansalada', 'бекон'] },
	{ emoji: '💧', words: ['water', 'agua', 'aigua', 'вода'] }
];

/** Word to icon. The first icon listed for a word wins. */
const BY_WORD = new Map<string, string>();
for (const { emoji, words } of ICONS) {
	for (const word of words) {
		const key = normal(word);
		if (!BY_WORD.has(key)) BY_WORD.set(key, emoji);
	}
}

/** An emoji (with any variation selector) at the start of a line, and the space after it. */
const LEADING_ICON = /^\p{Extended_Pictographic}️?\s*/u;

/** True when the line already starts with an icon, typed or imported. */
export function hasIcon(line: string): boolean {
	return LEADING_ICON.test(line.trim());
}

/** The line without its leading icon, so "🦐 gambas" reads as "gambas". */
export function withoutIcon(line: string): string {
	return line.trim().replace(LEADING_ICON, '');
}

/**
 * The icon to show for an ingredient line that has none: the first word of the line that names
 * an ingredient with an icon. Null when the line already has an icon or no word matches.
 */
export function iconFor(line: string): string | null {
	if (hasIcon(line)) return null;
	for (const word of normal(line).split(/[^\p{L}]+/u)) {
		const emoji = BY_WORD.get(word);
		if (emoji) return emoji;
	}
	return null;
}
