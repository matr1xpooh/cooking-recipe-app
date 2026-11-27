import { describe, expect, it } from 'vitest';
import { hasIcon, iconFor, withoutIcon } from './ingredient-icons';

describe('iconFor', () => {
	it('picks an icon from a word of the line, whatever the amount', () => {
		expect(iconFor('3 huevos')).toBe('🥚');
		expect(iconFor('Gambas 300 g')).toBe('🦐');
		expect(iconFor('harina 200 g')).toBe('🌾');
	});

	it('reads the four site languages', () => {
		expect(iconFor('2 cucharadas de aceite; 1 llimona')).toBe('🍋');
		expect(iconFor('Лимон 1 шт.')).toBe('🍋');
		expect(iconFor('1 tomàquet')).toBe('🍅');
		expect(iconFor('1 tomate')).toBe('🍅');
	});

	it('leaves a line with its own icon, and a line with no known word, alone', () => {
		expect(iconFor('🦐 gambas')).toBeNull();
		expect(iconFor('Sal al gusto')).toBe('🧂');
		expect(iconFor('Азафран по вкусу')).toBeNull();
	});
});

describe('hasIcon and withoutIcon', () => {
	it('recognises and removes an icon typed at the start', () => {
		expect(hasIcon('🦐 gambas')).toBe(true);
		expect(hasIcon('gambas 🦐')).toBe(false);
		expect(withoutIcon('🦐 gambas')).toBe('gambas');
		expect(withoutIcon('🍋️ limón')).toBe('limón');
	});
});
