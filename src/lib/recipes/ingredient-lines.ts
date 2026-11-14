/**
 * Lines of an ingredient or step list. Two kinds of line carry more than text:
 *
 *   "# Beef Marinade"   a heading over the ingredients below it (ingredients only)
 *   "> Sift first"      a note attached to the item above it (ingredients and steps)
 *   "> - Sift first"    the same, as a bullet inside the note
 *
 * Both markers are stored in the line itself, so a recipe stays a plain list of strings.
 */
export const HEADING_MARKER = '# ';
export const NOTE_MARKER = '> ';
export const BULLET_MARKER = '- ';

export function isHeading(line: string): boolean {
	return line.startsWith(HEADING_MARKER);
}

/** The words of a heading line, without the marker. Other lines are returned unchanged. */
export function headingText(line: string): string {
	return isHeading(line) ? line.slice(HEADING_MARKER.length).trim() : line;
}

/**
 * Puts the heading marker back on translated lines whose source line is a heading. The
 * marker is never translated, so this keeps headings right whatever translation is shown.
 */
export function restoreHeadings(translated: string[], source: string[]): string[] {
	return translated.map((line, i) =>
		i < source.length && isHeading(source[i]) && !isHeading(line)
			? HEADING_MARKER + headingText(line)
			: line
	);
}

/** A note line: ">" on its own (an empty note) or "> " followed by the note. */
export function isNote(line: string): boolean {
	return line === '>' || line.startsWith(NOTE_MARKER);
}

export interface NoteLine {
	/** True when the note starts with a bullet. */
	bullet: boolean;
	/** The note's text, with the markup of notes.ts. */
	text: string;
}

/** Reads a note line. Null for any other line. */
export function splitNote(line: string): NoteLine | null {
	if (!isNote(line)) return null;
	let body = line.slice(1).trim();
	let bullet = false;
	if (body === '-' || body.startsWith(BULLET_MARKER)) {
		bullet = true;
		body = body.slice(1).trim();
	}
	return { bullet, text: body };
}

/** Writes a note line again: the inverse of splitNote. */
export function joinNote(note: NoteLine): string {
	return NOTE_MARKER + (note.bullet ? BULLET_MARKER : '') + note.text;
}

export interface IngredientGroup {
	/** The heading over the group, or null for lines before the first heading. */
	heading: string | null;
	/** The item lines and their note lines, in order (see attachNotes). */
	items: string[];
}

/** Splits ingredient lines into groups. Each heading starts a new group. */
export function groupIngredients(lines: string[]): IngredientGroup[] {
	const groups: IngredientGroup[] = [];
	let current: IngredientGroup = { heading: null, items: [] };
	const flush = () => {
		if (current.heading !== null || current.items.length > 0) groups.push(current);
	};
	for (const line of lines) {
		if (isHeading(line)) {
			flush();
			current = { heading: headingText(line), items: [] };
		} else {
			current.items.push(line);
		}
	}
	flush();
	return groups;
}

export interface ItemWithNotes {
	/** The item's text. Null for notes that come before any item. */
	item: string | null;
	/** The notes written under the item, in order. */
	notes: NoteLine[];
}

/** Pairs each item with the note lines written under it. */
export function attachNotes(lines: string[]): ItemWithNotes[] {
	const result: ItemWithNotes[] = [];
	for (const line of lines) {
		const note = splitNote(line);
		if (note) {
			const last = result[result.length - 1];
			if (last) last.notes.push(note);
			else result.push({ item: null, notes: [note] });
		} else {
			result.push({ item: line, notes: [] });
		}
	}
	return result;
}

export type NoteBlock = { kind: 'list'; items: NoteLine[] } | { kind: 'paragraph'; line: NoteLine };

/** Groups notes for display: consecutive bullets form one list, other notes are paragraphs. */
export function noteBlocks(notes: NoteLine[]): NoteBlock[] {
	const blocks: NoteBlock[] = [];
	for (const note of notes) {
		const last = blocks[blocks.length - 1];
		if (note.bullet) {
			if (last?.kind === 'list') last.items.push(note);
			else blocks.push({ kind: 'list', items: [note] });
		} else {
			blocks.push({ kind: 'paragraph', line: note });
		}
	}
	return blocks;
}

/** A line and its position in the stored list, so an edit can change exactly that line. */
export interface Placed {
	text: string;
	index: number;
}

export interface PlacedItem {
	/** The item, or null for notes that come before any item. */
	item: Placed | null;
	notes: { note: NoteLine; index: number }[];
}

export interface PlacedGroup {
	heading: Placed | null;
	items: PlacedItem[];
}

/** Like groupIngredients and attachNotes together, keeping each line's index in the list. */
export function placeIngredients(lines: string[]): PlacedGroup[] {
	const groups: PlacedGroup[] = [];
	let current: PlacedGroup = { heading: null, items: [] };
	const flush = () => {
		if (current.heading !== null || current.items.length > 0) groups.push(current);
	};
	lines.forEach((line, index) => {
		if (isHeading(line)) {
			flush();
			current = { heading: { text: headingText(line), index }, items: [] };
		} else {
			placeItem(current.items, line, index);
		}
	});
	flush();
	return groups;
}

/** Like attachNotes, keeping each line's index. */
export function placeItems(lines: string[]): PlacedItem[] {
	const items: PlacedItem[] = [];
	lines.forEach((line, index) => placeItem(items, line, index));
	return items;
}

function placeItem(items: PlacedItem[], line: string, index: number): void {
	const note = splitNote(line);
	if (note) {
		const last = items[items.length - 1];
		if (last) last.notes.push({ note, index });
		else items.push({ item: null, notes: [{ note, index }] });
	} else {
		items.push({ item: { text: line, index }, notes: [] });
	}
}

/** The lines a delete removes: the line at `index` and the note lines written under it. */
export function lineRange(lines: string[], index: number): { start: number; end: number } {
	let end = index + 1;
	while (end < lines.length && isNote(lines[end])) end++;
	return { start: index, end };
}

/** The list without the lines in the range. */
export function removeRange(lines: string[], range: { start: number; end: number }): string[] {
	return lines.filter((_, i) => i < range.start || i >= range.end);
}
