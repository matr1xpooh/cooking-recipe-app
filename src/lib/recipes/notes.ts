/**
 * Notes markup: a small, safe subset with no HTML.
 *
 *   **bold**   *italic*   [red]colour[/red]   [link text](https://example.com)
 *
 * Colours: red, orange, green, blue, purple. Each toggle or tag applies until the
 * matching marker or the end of the notes. Unmatched markers simply run to the
 * end. Links accept only http and https addresses; their text is plain (no nested
 * styling). Text is never interpreted as HTML, so notes can't inject markup.
 */

export const NOTE_COLORS = ['red', 'orange', 'green', 'blue', 'purple'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface NoteSegment {
	text: string;
	bold: boolean;
	italic: boolean;
	color: NoteColor | null;
	/** Set for a link: the address it opens. Only http and https are ever set. */
	href?: string;
}

const TOKEN = /\*\*|\*|\[(red|orange|green|blue|purple)\]|\[\/(?:red|orange|green|blue|purple)\]/g;
/** [text](https://...). The text may not start with "/", so closing colour tags never match. */
const LINK = /\[(?!\/)([^\]\n]+)\]\((https?:\/\/[^\s()<>"]+)\)/g;

interface StyleState {
	bold: boolean;
	italic: boolean;
	color: NoteColor | null;
}

/** Adds the text runs of styled notes (no links) to the segments, moving the style state on. */
function parseStyled(source: string, state: StyleState, segments: NoteSegment[]) {
	let last = 0;
	const push = (text: string) => {
		if (text.length > 0)
			segments.push({ text, bold: state.bold, italic: state.italic, color: state.color });
	};

	for (const match of source.matchAll(TOKEN)) {
		const index = match.index ?? 0;
		push(source.slice(last, index));
		last = index + match[0].length;

		const token = match[0];
		if (token === '**') state.bold = !state.bold;
		else if (token === '*') state.italic = !state.italic;
		else if (match[1]) state.color = match[1] as NoteColor;
		else state.color = null; // a closing colour tag
	}
	push(source.slice(last));
}

/** Splits notes into text runs, each with its formatting. */
export function parseNotes(source: string): NoteSegment[] {
	const segments: NoteSegment[] = [];
	const state: StyleState = { bold: false, italic: false, color: null };
	let last = 0;

	for (const match of source.matchAll(LINK)) {
		const index = match.index ?? 0;
		parseStyled(source.slice(last, index), state, segments);
		segments.push({
			text: match[1],
			bold: state.bold,
			italic: state.italic,
			color: state.color,
			href: match[2]
		});
		last = index + match[0].length;
	}
	parseStyled(source.slice(last), state, segments);
	return segments;
}
