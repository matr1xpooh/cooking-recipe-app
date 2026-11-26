import { describe, expect, it } from 'vitest';
import { factorFor, firstAmount, hasAmount, scaleLine } from './scale';

describe('scaleLine', () => {
	it('multiplies a whole amount and keeps the rest of the line', () => {
		expect(scaleLine('200 g harina', 0.9)).toBe('180 g harina');
	});

	it('halves and doubles', () => {
		expect(scaleLine('2 huevos', 0.5)).toBe('1 huevos');
		expect(scaleLine('150 g azúcar', 2)).toBe('300 g azúcar');
	});

	it('writes a decimal result with a point', () => {
		expect(scaleLine('3 huevos', 0.5)).toBe('1.5 huevos');
	});

	it('keeps a decimal comma when the input had one', () => {
		expect(scaleLine('1,5 l agua', 2)).toBe('3 l agua');
		expect(scaleLine('2,5 kg patatas', 0.5)).toBe('1,25 kg patatas');
	});

	it('scales an ascii fraction and writes it as a fraction', () => {
		expect(scaleLine('1/2 cup milk', 0.5)).toBe('1/4 cup milk');
		expect(scaleLine('1/2 cup milk', 2)).toBe('1 cup milk');
	});

	it('scales a mixed number', () => {
		expect(scaleLine('1 1/2 cups flour', 2)).toBe('3 cups flour');
		expect(scaleLine('1 1/2 cups flour', 0.5)).toBe('3/4 cups flour');
	});

	it('scales a unicode fraction and keeps the symbol', () => {
		expect(scaleLine('½ taza de azúcar', 2)).toBe('1 taza de azúcar');
		expect(scaleLine('1¾ cups', 2)).toBe('3 ½ cups');
	});

	it('scales both ends of a range and keeps the dash as written', () => {
		expect(scaleLine('500-600 мл воды', 0.5)).toBe('250-300 мл воды');
		expect(scaleLine('500 - 600 мл', 0.5)).toBe('250 - 300 мл');
	});

	it('scales every amount in the line, not only the first', () => {
		expect(scaleLine('Pasta 500 g, 2 cups broth', 2)).toBe('Pasta 1000 g, 4 cups broth');
	});

	it('leaves headings and notes unchanged', () => {
		expect(scaleLine('# 200 g marinade', 2)).toBe('# 200 g marinade');
		expect(scaleLine('> 2 minutes', 2)).toBe('> 2 minutes');
		expect(scaleLine('> - 2 minutes', 2)).toBe('> - 2 minutes');
	});

	it('leaves lines without an amount unchanged', () => {
		expect(scaleLine('Соль - по вкусу', 2)).toBe('Соль - по вкусу');
		expect(scaleLine('Sal al gusto', 2)).toBe('Sal al gusto');
	});

	it('leaves amounts inside brackets and percentages unchanged', () => {
		expect(scaleLine('Pasta (about 200 g) 500 g', 2)).toBe('Pasta (about 200 g) 1000 g');
		expect(scaleLine('Творог 12 % 750 г', 2)).toBe('Творог 12 % 1500 г');
	});

	it('does not read digits that belong to a word', () => {
		expect(scaleLine('B12 vitamin', 2)).toBe('B12 vitamin');
	});

	it('reads Spanish, Catalan and Russian lines', () => {
		expect(scaleLine('2 cucharadas de aceite', 0.5)).toBe('1 cucharadas de aceite');
		expect(scaleLine('2 culleradetes de sal', 2)).toBe('4 culleradetes de sal');
		expect(scaleLine('Сахар 150 г', 2)).toBe('Сахар 300 г');
	});

	it('returns the line as it is at factor 1', () => {
		expect(scaleLine('1/2 cup milk', 1)).toBe('1/2 cup milk');
	});
});

describe('factorFor', () => {
	it('gives the factor that makes the first amount the typed value', () => {
		expect(factorFor('200 g harina', 180)).toBeCloseTo(0.9);
		expect(scaleLine('200 g harina', factorFor('200 g harina', 180) ?? 1)).toBe('180 g harina');
	});

	it('reads a mixed number as its value', () => {
		expect(factorFor('1 1/2 cups', 3)).toBeCloseTo(2);
	});

	it('returns null when the line has no amount or the typed value is not positive', () => {
		expect(factorFor('harina', 180)).toBeNull();
		expect(factorFor('200 g harina', 0)).toBeNull();
	});
});

describe('firstAmount and hasAmount', () => {
	it('reads the first amount, the lower end of a range', () => {
		expect(firstAmount('500-600 мл')).toBe(500);
	});

	it('tells lines with an amount from the rest', () => {
		expect(hasAmount('200 g harina')).toBe(true);
		expect(hasAmount('Sal al gusto')).toBe(false);
		expect(hasAmount('# 200 g marinade')).toBe(false);
		expect(hasAmount('> 2 minutes')).toBe(false);
	});
});
