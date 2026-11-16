import { mergeIngredientLines } from './recipe.js';
import { MAX_IMAGE_BYTES } from './screenshot.js';

/** Why a photo could not be added or read. The keys match the messages shown to the user. */
export type PhotoErrorKey =
	| 'image_too_large'
	| 'image_invalid'
	| 'clipboard_unavailable'
	| 'clipboard_denied'
	| 'no_image_on_clipboard'
	| 'no_text_found'
	| 'ocr_failed';

/**
 * The reason a file cannot be added as a photo, or null when it can. Only PNG and JPEG are
 * accepted, and the size is capped. The server checks again.
 */
export function photoProblem(file: {
	size: number;
	type: string;
}): 'image_too_large' | 'image_invalid' | null {
	if (file.size > MAX_IMAGE_BYTES) return 'image_too_large';
	if (file.type !== 'image/png' && file.type !== 'image/jpeg') return 'image_invalid';
	return null;
}

/** Reads a PNG or JPEG from the clipboard, such as a screenshot. Returns the reason when there is none. */
export async function readClipboardImage(): Promise<File | PhotoErrorKey> {
	if (!navigator.clipboard?.read) return 'clipboard_unavailable';
	try {
		for (const item of await navigator.clipboard.read()) {
			const type = item.types.find((t) => t === 'image/png' || t === 'image/jpeg');
			if (!type) continue;
			const blob = await item.getType(type);
			const extension = type === 'image/png' ? 'png' : 'jpg';
			return new File([blob], `clipboard.${extension}`, { type });
		}
		return 'no_image_on_clipboard';
	} catch {
		return 'clipboard_denied';
	}
}

/** Sends a photo to the server, which reads the ingredient lines from it. */
export async function readImageText(
	blob: Blob
): Promise<{ lines: string[] } | { error: PhotoErrorKey }> {
	try {
		const body = new FormData();
		body.append('image', blob, 'image.png');
		const res = await fetch('/api/recipes/ocr', { method: 'POST', body });
		const data = await res.json().catch(() => null);
		if (!res.ok) return { error: 'ocr_failed' };
		const lines: string[] = Array.isArray(data?.ingredients) ? data.ingredients : [];
		return lines.length > 0 ? { lines } : { error: 'no_text_found' };
	} catch {
		return { error: 'ocr_failed' };
	}
}

/**
 * The lines from a photo that are not already in the list (ignoring case and spaces), in the
 * order they were read. Current lines are not changed.
 */
export function newIngredientLines(current: string[], incoming: string[]): string[] {
	const present = current.filter((line) => line.trim().length > 0).length;
	return mergeIngredientLines(current, incoming).slice(present);
}
