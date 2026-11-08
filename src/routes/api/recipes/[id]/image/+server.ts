import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MAX_IMAGE_BYTES, sniffImageType } from '#lib/recipes/screenshot.js';
import { isSafeId, readImage, saveImage } from '#lib/server/recipe-data.js';

/** GET /api/recipes/<id>/image -> the original screenshot bytes */
export const GET: RequestHandler = async ({ params }) => {
	if (!isSafeId(params.id)) error(404, 'not found');
	const image = await readImage(params.id);
	if (!image) error(404, 'not found');
	return new Response(new Uint8Array(image.bytes), {
		headers: { 'content-type': image.type, 'cache-control': 'no-store' }
	});
};

/** PUT /api/recipes/<id>/image  body: the PNG or JPEG file, as sent */
export const PUT: RequestHandler = async ({ params, request }) => {
	if (!isSafeId(params.id)) return json({ error: 'recipe_invalid' }, { status: 400 });
	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.length > MAX_IMAGE_BYTES) return json({ error: 'image_too_large' }, { status: 413 });
	const type = sniffImageType(bytes);
	if (type === null) return json({ error: 'image_invalid' }, { status: 400 });
	await saveImage(params.id, bytes, type);
	return new Response(null, { status: 204 });
};
