import { describe, it, expect } from 'vitest';
import { parseNotes } from './notes';

describe('parseNotes', () => {
	it('returns one plain segment for plain text', () => {
		expect(parseNotes('Use less salt.')).toEqual([
			{ text: 'Use less salt.', bold: false, italic: false, color: null }
		]);
	});

	it('applies bold and italic toggles', () => {
		expect(parseNotes('a **b** *c* d')).toEqual([
			{ text: 'a ', bold: false, italic: false, color: null },
			{ text: 'b', bold: true, italic: false, color: null },
			{ text: ' ', bold: false, italic: false, color: null },
			{ text: 'c', bold: false, italic: true, color: null },
			{ text: ' d', bold: false, italic: false, color: null }
		]);
	});

	it('applies colour tags and closes them', () => {
		expect(parseNotes('[red]hot[/red] and [blue]cold[/blue]')).toEqual([
			{ text: 'hot', bold: false, italic: false, color: 'red' },
			{ text: ' and ', bold: false, italic: false, color: null },
			{ text: 'cold', bold: false, italic: false, color: 'blue' }
		]);
	});

	it('combines styles', () => {
		expect(parseNotes('[green]**very *important***[/green]')).toEqual([
			{ text: 'very ', bold: true, italic: false, color: 'green' },
			{ text: 'important', bold: true, italic: true, color: 'green' }
		]);
	});

	it('runs unmatched markers to the end', () => {
		expect(parseNotes('**open bold')).toEqual([
			{ text: 'open bold', bold: true, italic: false, color: null }
		]);
	});

	it('keeps line breaks and treats HTML as plain text', () => {
		expect(parseNotes('line one\n<script>x</script>')).toEqual([
			{ text: 'line one\n<script>x</script>', bold: false, italic: false, color: null }
		]);
	});

	it('leaves unknown colour names as text', () => {
		expect(parseNotes('[pink]x[/pink]')).toEqual([
			{ text: '[pink]x[/pink]', bold: false, italic: false, color: null }
		]);
	});

	it('returns no segments for empty notes', () => {
		expect(parseNotes('')).toEqual([]);
	});

	it('makes a link from text and an http or https address', () => {
		expect(parseNotes('See [the video](https://example.com/v?x=1) now')).toEqual([
			{ text: 'See ', bold: false, italic: false, color: null },
			{
				text: 'the video',
				bold: false,
				italic: false,
				color: null,
				href: 'https://example.com/v?x=1'
			},
			{ text: ' now', bold: false, italic: false, color: null }
		]);
	});

	it('keeps the style that is on when a link starts', () => {
		expect(parseNotes('**[go](http://a.test)**')).toEqual([
			{ text: 'go', bold: true, italic: false, color: null, href: 'http://a.test' }
		]);
	});

	it('does not make a link from other addresses', () => {
		expect(parseNotes('[x](javascript:alert(1))')).toEqual([
			{ text: '[x](javascript:alert(1))', bold: false, italic: false, color: null }
		]);
	});

	it('does not read a closing colour tag followed by brackets as a link', () => {
		expect(parseNotes('[red]a[/red](https://x.test)')).toEqual([
			{ text: 'a', bold: false, italic: false, color: 'red' },
			{ text: '(https://x.test)', bold: false, italic: false, color: null }
		]);
	});
});
