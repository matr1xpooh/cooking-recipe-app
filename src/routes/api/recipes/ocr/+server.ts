import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MAX_IMAGE_BYTES, parseIngredientLines, sniffImageType } from '#lib/recipes/screenshot.js';
import { detectLines, OcrError } from '#lib/server/ocr.js';

/** POST /api/recipes/ocr  multipart field "image" (PNG or JPEG) -> { ingredients: string[] } */
export const POST: RequestHandler = async ({ request }) => {
	let file: FormDataEntryValue | null;
	try {
		file = (await request.formData()).get('image');
	} catch {
		return json({ error: 'image_invalid' }, { status: 400 });
	}
	if (!(file instanceof File)) return json({ error: 'image_invalid' }, { status: 400 });
	if (file.size > MAX_IMAGE_BYTES) return json({ error: 'image_too_large' }, { status: 413 });

	const bytes = new Uint8Array(await file.arrayBuffer());
	if (sniffImageType(bytes) === null) return json({ error: 'image_invalid' }, { status: 400 });

	try {
		const ingredients = parseIngredientLines(await detectLines(bytes));
		if (ingredients.length === 0) return json({ error: 'no_text_found' }, { status: 422 });
		return json({ ingredients });
	} catch (error) {
		if (error instanceof OcrError) return json({ error: error.key }, { status: 502 });
		throw error;
	}
};
