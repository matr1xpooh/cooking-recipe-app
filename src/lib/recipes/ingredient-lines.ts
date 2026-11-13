/**
 * Ingredient lines can be headings over the ingredients below them ("Beef Marinade",
 * "For the Stir-fry"). A heading is stored as an ordinary line that starts with HEADING_MARKER.
 */
export const HEADING_MARKER = '# ';

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

export interface IngredientGroup {
	/** The heading over the group, or null for lines before the first heading. */
	heading: string | null;
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
