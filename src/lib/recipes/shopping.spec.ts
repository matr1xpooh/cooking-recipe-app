import { describe, expect, it } from 'vitest';
import { buildShoppingList, formatAmounts, parseIngredient, shoppingToText } from './shopping';

const units = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', pcs: 'pcs' };

describe('parseIngredient', () => {
	it('reads a mass after the name', () => {
		expect(parseIngredient('Сахар 150 г')).toMatchObject({ name: 'Сахар', amounts: { mass: 150 } });
	});

	it('reads a count with a unit word', () => {
		expect(parseIngredient('Яйца 4 шт.')).toMatchObject({ name: 'Яйца', amounts: { count: 4 } });
	});

	it('ignores a percentage and keeps two creams apart by it', () => {
		const a = parseIngredient('Сливки 33 % 600 мл');
		const b = parseIngredient('Сливки 22% 200 мл');
		expect(a).toMatchObject({ name: 'Сливки', amounts: { volume: 600 } });
		expect(a.key).not.toBe(b.key);
		expect(a.key).toContain('33');
	});

	it('reads a percentage that is written before the amount', () => {
		expect(parseIngredient('Творог 12 % 750 г')).toMatchObject({
			name: 'Творог',
			amounts: { mass: 750 }
		});
	});

	it('takes the upper end of a range', () => {
		expect(parseIngredient('Сливки 33 % 500-600 мл').amounts).toEqual({ volume: 600 });
	});

	it('ignores a remark in brackets', () => {
		expect(parseIngredient('Рис круглозёрный 100 г (200 г отварного)').amounts).toEqual({
			mass: 100
		});
	});

	it('reads a range and a remark in brackets together', () => {
		expect(
			parseIngredient(
				'Сливки (любой жирности; если слишком густые, немного разбавить водой) - 500-600 мл'
			)
		).toMatchObject({ name: 'Сливки', amounts: { volume: 600 } });
	});

	it('reads a fraction with a cup', () => {
		expect(parseIngredient('1/4 cup tahini paste (I used Soom tahini)')).toMatchObject({
			name: 'tahini paste',
			amounts: { volume: 60 }
		});
	});

	it('reads a mixed number', () => {
		expect(parseIngredient('1 1/2 cups flour').amounts).toEqual({ volume: 360 });
	});

	it('reads a spoon unit', () => {
		expect(parseIngredient('2 ст. л. соевого соуса')).toMatchObject({
			name: 'соевого соуса',
			amounts: { volume: 30 }
		});
	});

	it('reads a line that starts with the amount', () => {
		expect(parseIngredient('2 Italian eggplants or small globe eggplants')).toMatchObject({
			name: 'Italian eggplants or small globe eggplants',
			amounts: { count: 2 }
		});
	});

	it('reads a mixed number written with a fraction character', () => {
		expect(parseIngredient('1¾ cups caster sugar').amounts).toEqual({ volume: 420 });
	});

	it('reads a spoon written without a dot, and in words', () => {
		expect(parseIngredient('1/2 ч. л соли').amounts).toEqual({ volume: 2.5 });
		expect(parseIngredient('Корица 1 ч. ложка').amounts).toEqual({ volume: 5 });
	});

	it('treats a pinch as needed', () => {
		expect(parseIngredient('1 pinch salt')).toMatchObject({ toTaste: true, amounts: {} });
		expect(parseIngredient('Соль 2 щепотки')).toMatchObject({ name: 'Соль', toTaste: true });
		expect(parseIngredient('Соль - щепотка')).toMatchObject({
			name: 'Соль',
			amounts: {},
			toTaste: true
		});
		expect(parseIngredient('1 pinch salt')).toMatchObject({ name: 'salt', amounts: {} });
	});

	it('takes the name after a label that ends in a colon', () => {
		expect(parseIngredient('Для соуса тоннато: 150 г тунца в собственном соку')).toMatchObject({
			name: 'тунца в собственном соку',
			amounts: { mass: 150 }
		});
	});

	it('marks "to taste" as needed, with no amount', () => {
		expect(parseIngredient('Соль - по вкусу')).toMatchObject({
			name: 'Соль',
			amounts: {},
			toTaste: true
		});
	});

	it('treats a line with no amount as needed', () => {
		expect(parseIngredient('Kosher salt and black pepper')).toMatchObject({
			amounts: {},
			toTaste: true
		});
	});
});

describe('buildShoppingList', () => {
	it('adds the same ingredient across recipes', () => {
		const items = buildShoppingList([
			{ id: 'a', title: 'Cake', lines: ['Sugar 150 g'] },
			{ id: 'b', title: 'Cookies', lines: ['sugar 200 g'] }
		]);
		expect(items).toHaveLength(1);
		expect(items[0]?.amounts).toEqual({ mass: 350 });
		expect(items[0]?.from.map((f) => f.recipeId)).toEqual(['a', 'b']);
	});

	it('keeps two creams with different percentages apart', () => {
		const items = buildShoppingList([
			{ id: 'a', title: 'A', lines: ['Сливки 33 % 600 мл'] },
			{ id: 'b', title: 'B', lines: ['Сливки 22% 200 мл'] }
		]);
		expect(items).toHaveLength(2);
	});

	it('keeps grams and millilitres side by side on one item', () => {
		const items = buildShoppingList([
			{ id: 'a', title: 'A', lines: ['Sugar 100 g', 'Sugar 240 ml'] }
		]);
		expect(items).toHaveLength(1);
		expect(formatAmounts(items[0]?.amounts ?? {}, units)).toBe('100 g + 240 ml');
	});

	it('skips section names and notes', () => {
		const items = buildShoppingList([
			{ id: 'a', title: 'A', lines: ['# Dough', '> a note', 'Sugar 100 g'] }
		]);
		expect(items.map((i) => i.name)).toEqual(['Sugar']);
	});

	it('puts an ingredient with no amount in as needed', () => {
		const items = buildShoppingList([{ id: 'a', title: 'A', lines: ['Соль', 'Соль - по вкусу'] }]);
		expect(items[0]?.toTaste).toBe(true);
	});
});

describe('formatAmounts', () => {
	it('shows kilograms from 1000 g and litres from 1000 ml', () => {
		expect(formatAmounts({ mass: 1250 }, units)).toBe('1.25 kg');
		expect(formatAmounts({ volume: 2000 }, units)).toBe('2 l');
	});
});

describe('shoppingToText', () => {
	it('leaves out ticked items and writes as-needed items last', () => {
		const items = buildShoppingList([
			{ id: 'a', title: 'A', lines: ['Sugar 150 g', 'Flour 200 g', 'Salt - по вкусу'] }
		]);
		const flour = items.find((i) => i.name === 'Flour')?.key ?? '';
		const text = shoppingToText(items, [flour], units, { asNeeded: 'As needed' });
		expect(text).toBe('- Sugar: 150 g\n\nAs needed\n- Salt');
	});
});
