import { describe, it, expect } from 'vitest';
import { notesToHtml, htmlToNotes } from './notes-html';
import { parseNotes } from './notes';

describe('notesToHtml', () => {
	it('maps markup to tags and escapes text', () => {
		expect(notesToHtml('**Use** *less* [red]salt[/red] & <pepper>')).toBe(
			'<b>Use</b> <i>less</i> <span data-color="red">salt</span> &amp; &lt;pepper&gt;'
		);
	});
});

describe('round trip', () => {
	it.each([
		'Plain text',
		'Watch the **heat**',
		'**very *important*** and [green]good[/green]',
		'[blue]**bold blue**[/blue] then [red]red[/red]',
		'line one\nline two'
	])('keeps formatting for %j', (notes) => {
		const back = htmlToNotes(notesToHtml(notes));
		expect(parseNotes(back)).toEqual(parseNotes(notes));
	});
});

describe('htmlToNotes', () => {
	it('drops unknown tags and invalid colours', () => {
		expect(htmlToNotes('<script>x</script><span data-color="pink">y</span>')).toBe('xy');
	});

	it('neutralises markup characters in translated text', () => {
		const back = htmlToNotes('Add 2*3 [sic] &amp; <b>stir</b>');
		expect(parseNotes(back)).toEqual([
			{ text: 'Add 2∗3 (sic) & ', bold: false, italic: false, color: null },
			{ text: 'stir', bold: true, italic: false, color: null }
		]);
	});
});
