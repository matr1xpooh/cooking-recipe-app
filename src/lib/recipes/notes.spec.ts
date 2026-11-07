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
});
