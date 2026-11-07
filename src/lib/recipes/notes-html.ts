import { parseNotes, type NoteColor, type NoteSegment } from './notes';

/**
 * Converts notes markup to HTML for Translate and back again, so formatting
 * survives translation. Translate keeps tags and translates only the text.
 *
 *   **bold** -> <b>, *italic* -> <i>, [red]x[/red] -> <span data-color="red">
 */

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeHtml(text: string): string {
	return text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');
}

export function notesToHtml(notes: string): string {
	return parseNotes(notes)
		.map((segment) => {
			let html = escapeHtml(segment.text);
			if (segment.italic) html = `<i>${html}</i>`;
			if (segment.bold) html = `<b>${html}</b>`;
			if (segment.color) html = `<span data-color="${segment.color}">${html}</span>`;
			return html;
		})
		.join('');
}

const COLORS = new Set<string>(['red', 'orange', 'green', 'blue', 'purple']);

/**
 * Converts translated HTML back to notes markup. Only b, i and span[data-color]
 * are kept; other tags are dropped. Literal "*" and square brackets in the text
 * are replaced, since they would otherwise read as markup.
 */
export function htmlToNotes(html: string): string {
	const segments: NoteSegment[] = [];
	let bold = 0;
	let italic = 0;
	let color: NoteColor | null = null;

	// Any tag is consumed; only b, i and span are acted on. A bare "<" is text.
	for (const token of html.matchAll(/<(\/?)([a-z]+)([^>]*)>|([^<]+|<)/gi)) {
		const [, closing, tag, attrs, text] = token;
		if (text !== undefined) {
			const clean = decodeHtml(text)
				.replace(/\*/g, '\u2217')
				.replace(/\[/g, '(')
				.replace(/\]/g, ')');
			if (clean.length > 0)
				segments.push({ text: clean, bold: bold > 0, italic: italic > 0, color });
			continue;
		}
		const isClosing = closing === '/';
		const name = tag.toLowerCase();
		if (name === 'b') bold += isClosing ? -1 : 1;
		else if (name === 'i') italic += isClosing ? -1 : 1;
		else if (name === 'span') {
			if (isClosing) color = null;
			else {
				const found = attrs.match(/data-color="([a-z]+)"/i)?.[1]?.toLowerCase();
				color = found && COLORS.has(found) ? (found as NoteColor) : null;
			}
		}
	}
	return serializeSegments(segments);
}

/** Emits notes markup for segments, toggling markers only where formatting changes. */
export function serializeSegments(segments: NoteSegment[]): string {
	let out = '';
	let bold = false;
	let italic = false;
	let color: NoteColor | null = null;

	for (const segment of segments) {
		if (segment.color !== color) {
			if (color) out += `[/${color}]`;
			if (segment.color) out += `[${segment.color}]`;
			color = segment.color;
		}
		if (segment.bold !== bold) {
			out += '**';
			bold = segment.bold;
		}
		if (segment.italic !== italic) {
			out += '*';
			italic = segment.italic;
		}
		out += segment.text;
	}
	if (bold) out += '**';
	if (italic) out += '*';
	if (color) out += `[/${color}]`;
	return out;
}
