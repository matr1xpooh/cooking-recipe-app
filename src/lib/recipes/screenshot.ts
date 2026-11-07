/** Largest screenshot accepted, in bytes. Textract's synchronous limit is 10 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageType = 'image/png' | 'image/jpeg';

/** Identifies PNG and JPEG by their file signatures, ignoring the client-supplied type. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
	if (
		bytes.length >= 4 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47
	) {
		return 'image/png';
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return 'image/jpeg';
	}
	return null;
}

// Section headings a screenshot may contain. Not ingredients, so they are dropped.
const HEADING = /^(ingredients?|ingredientes?|ингредиенты|ингредиент)\s*:?\s*$/i;

/**
 * Turns OCR lines into ingredient lines: drops headings, bullets and sub-headings
 * ("Sauce:"), and lines without words. Quantities and wording are kept as written.
 */
export function parseIngredientLines(lines: string[]): string[] {
	const result: string[] = [];
	for (const raw of lines) {
		const line = raw
			.replace(/\s+/g, ' ')
			.replace(/^[-•*·▪●]\s*/, '')
			.trim();
		if (line.length === 0) continue;
		if (HEADING.test(line)) continue;
		if (line.endsWith(':')) continue;
		if (!/\p{L}{2,}/u.test(line)) continue;
		result.push(line);
	}
	return result;
}
