import { describe, expect, it } from 'vitest';
import { applyMarkup, insertLineAfter, insertLink, wrapSelection } from './markup-edit';

describe('wrapSelection', () => {
	it('wraps the selected words and keeps them selected', () => {
		expect(wrapSelection('add salt now', 4, 8, '**', '**')).toEqual({
			value: 'add **salt** now',
			start: 6,
			end: 10
		});
	});

	it('puts empty markers at the caret when nothing is selected', () => {
		expect(wrapSelection('ab', 1, 1, '*', '*')).toEqual({ value: 'a**b', start: 2, end: 2 });
	});
});

describe('insertLineAfter', () => {
	it('starts a line after the line the caret is on', () => {
		const value = 'first line\nsecond line';
		expect(insertLineAfter(value, 3, 3, '> ')).toEqual({
			value: 'first line\n> \nsecond line',
			start: 13,
			end: 13
		});
	});

	it('adds the line at the end when the caret is on the last line', () => {
		expect(insertLineAfter('only', 2, 2, '> - ')).toEqual({
			value: 'only\n> - ',
			start: 9,
			end: 9
		});
	});
});

describe('insertLink', () => {
	it('turns the selection into the link text and selects the address to type', () => {
		expect(insertLink('see the clip', 4, 12)).toEqual({
			value: 'see [the clip](https://)',
			start: 15,
			end: 23
		});
	});

	it('uses a placeholder text when nothing is selected', () => {
		const edit = insertLink('', 0, 0);
		expect(edit.value).toBe('[text](https://)');
		expect(edit.value.slice(edit.start, edit.end)).toBe('https://');
	});
});

describe('applyMarkup', () => {
	it('maps each toolbar button to its markup', () => {
		expect(applyMarkup({ kind: 'bold' }, 'x', 0, 1).value).toBe('**x**');
		expect(applyMarkup({ kind: 'italic' }, 'x', 0, 1).value).toBe('*x*');
		expect(applyMarkup({ kind: 'color', color: 'red' }, 'x', 0, 1).value).toBe('[red]x[/red]');
		expect(applyMarkup({ kind: 'note' }, 'x', 0, 0).value).toBe('x\n> ');
		expect(applyMarkup({ kind: 'list' }, 'x', 0, 0).value).toBe('x\n> - ');
	});
});
