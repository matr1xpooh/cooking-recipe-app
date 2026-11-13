import { parseNotes, type NoteColor, type NoteSegment } from './notes';

/**
 * Converts notes markup to HTML for Translate and back again, so formatting
 * survives translation. Translate keeps tags and translates only the text.
 *
 *   **bold** -> <b>, *italic* -> <i>, [red]x[/red] -> <span data-color="red">,
 *   [text](https://...) -> <a href="https://...">
 */

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
	return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
			if (segment.href) html = `<a href="${escapeAttribute(segment.href)}">${html}</a>`;
			if (segment.italic) html = `<i>${html}</i>`;
			if (segment.bold) html = `<b>${html}</b>`;
			if (segment.color) html = `<span data-color="${segment.color}">${html}</span>`;
			return html;
		})
		.join('');
}

const COLORS = new Set<string>(['red', 'orange', 'green', 'blue', 'purple']);

/** The same address rule as the notes parser: http or https, no spaces or brackets. */
const SAFE_HREF = /^https?:\/\/[^\s()<>"]+$/;

/**
 * Converts translated HTML back to notes markup. Only b, i, span[data-color] and
 * a[href] are kept; other tags are dropped. Links with any other address keep their
 * text only. Literal "*" and square brackets in the text are replaced, since they
 * would otherwise read as markup.
 */
export function htmlToNotes(html: string): string {
	const segments: NoteSegment[] = [];
	let bold = 0;
	let italic = 0;
	let color: NoteColor | null = null;
	let href: string | null = null;

	// Any tag is consumed; only b, i, span and a are acted on. A bare "<" is text.
	for (const token of html.matchAll(/<(\/?)([a-z]+)([^>]*)>|([^<]+|<)/gi)) {
		const [, closing, tag, attrs, text] = token;
		if (text !== undefined) {
			const clean = decodeHtml(text).replace(/\*/g, '∗').replace(/\[/g, '(').replace(/\]/g, ')');
			if (clean.length > 0) {
				const segment: NoteSegment = {
					text: clean,
					bold: bold > 0,
					italic: italic > 0,
					color
				};
				if (href) segment.href = href;
				segments.push(segment);
			}
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
		} else if (name === 'a') {
			if (isClosing) href = null;
			else {
				const found = attrs.match(/href="([^"]*)"/i)?.[1];
				const address = found ? decodeHtml(found).trim() : '';
				href = SAFE_HREF.test(address) ? address : null;
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
		// A link whose text starts with "/" would read as a closing colour tag: keep it as text.
		const asLink = segment.href && !segment.text.startsWith('/');
		out += asLink ? `[${segment.text}](${segment.href})` : segment.text;
	}
	if (bold) out += '**';
	if (italic) out += '*';
	if (color) out += `[/${color}]`;
	return out;
}
