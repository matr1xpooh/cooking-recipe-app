import type { NoteColor } from './notes';

/**
 * Edits to a text field made by the notes toolbar. Each takes the field's text and its
 * selection and returns the new text with the selection to show afterwards. No DOM here,
 * so the rules can be tested directly.
 */

export interface TextEdit {
	value: string;
	start: number;
	end: number;
}

export type MarkupAction =
	| { kind: 'bold' }
	| { kind: 'italic' }
	| { kind: 'color'; color: NoteColor }
	| { kind: 'note' }
	| { kind: 'list' }
	| { kind: 'link' };

/** Puts open and close around the selection. The selected text stays selected. */
export function wrapSelection(
	value: string,
	start: number,
	end: number,
	open: string,
	close: string
): TextEdit {
	const selected = value.slice(start, end);
	return {
		value: value.slice(0, start) + open + selected + close + value.slice(end),
		start: start + open.length,
		end: start + open.length + selected.length
	};
}

/** Starts a new line after the line the selection ends on, with the given marker. */
export function insertLineAfter(
	value: string,
	start: number,
	end: number,
	marker: string
): TextEdit {
	const lineEnd = value.indexOf('\n', end);
	const at = lineEnd === -1 ? value.length : lineEnd;
	const insert = `\n${marker}`;
	const caret = at + insert.length;
	return {
		value: value.slice(0, at) + insert + value.slice(at),
		start: caret,
		end: caret
	};
}

/**
 * Turns the selection into a link. With nothing selected the link text is "text". The
 * address placeholder is selected, ready to be typed over.
 */
export function insertLink(value: string, start: number, end: number): TextEdit {
	const selected = value.slice(start, end);
	const text = selected.length > 0 ? selected : 'text';
	const insert = `[${text}](https://)`;
	const urlStart = start + text.length + 3; // "[", the text, and "]("
	return {
		value: value.slice(0, start) + insert + value.slice(end),
		start: urlStart,
		end: urlStart + 'https://'.length
	};
}

/** The edit a toolbar button makes to the field. */
export function applyMarkup(
	action: MarkupAction,
	value: string,
	start: number,
	end: number
): TextEdit {
	switch (action.kind) {
		case 'bold':
			return wrapSelection(value, start, end, '**', '**');
		case 'italic':
			return wrapSelection(value, start, end, '*', '*');
		case 'color':
			return wrapSelection(value, start, end, `[${action.color}]`, `[/${action.color}]`);
		case 'note':
			return insertLineAfter(value, start, end, '> ');
		case 'list':
			return insertLineAfter(value, start, end, '> - ');
		case 'link':
			return insertLink(value, start, end);
	}
}
