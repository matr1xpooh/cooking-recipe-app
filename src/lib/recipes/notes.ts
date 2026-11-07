/**
 * Notes markup: a small, safe subset with no HTML.
 *
 *   **bold**   *italic*   [red]colour[/red]
 *
 * Colours: red, orange, green, blue, purple. Each toggle or tag applies until the
 * matching marker or the end of the notes. Unmatched markers simply run to the
 * end. Text is never interpreted as HTML, so notes can't inject markup.
 */

export const NOTE_COLORS = ['red', 'orange', 'green', 'blue', 'purple'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface NoteSegment {
	text: string;
	bold: boolean;
	italic: boolean;
	color: NoteColor | null;
}

const TOKEN = /\*\*|\*|\[(red|orange|green|blue|purple)\]|\[\/(?:red|orange|green|blue|purple)\]/g;

/** Splits notes into text runs, each with its formatting. */
export function parseNotes(source: string): NoteSegment[] {
	const segments: NoteSegment[] = [];
	let bold = false;
	let italic = false;
	let color: NoteColor | null = null;
	let last = 0;

	const push = (text: string) => {
		if (text.length > 0) segments.push({ text, bold, italic, color });
	};

	for (const match of source.matchAll(TOKEN)) {
		const index = match.index ?? 0;
		push(source.slice(last, index));
		last = index + match[0].length;

		const token = match[0];
		if (token === '**') bold = !bold;
		else if (token === '*') italic = !italic;
		else if (match[1]) color = match[1] as NoteColor;
		else color = null; // a closing colour tag
	}
	push(source.slice(last));
	return segments;
}
