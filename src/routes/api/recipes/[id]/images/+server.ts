import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MAX_IMAGE_BYTES, sniffImageType } from '#lib/recipes/screenshot.js';
import { isSafeId } from '#lib/server/ids.js';
import { getStore } from '#lib/server/store.js';
import { recordUsage } from '#lib/server/usage.js';

/** POST /api/recipes/<id>/images  body: a PNG or JPEG file, as sent -> { id } */
export const POST: RequestHandler = async ({ params, request }) => {
	if (!isSafeId(params.id)) error(404, 'not found');
	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.length > MAX_IMAGE_BYTES) return json({ error: 'image_too_large' }, { status: 413 });
	const type = sniffImageType(bytes);
	if (type === null) return json({ error: 'image_invalid' }, { status: 400 });
	const store = getStore();
	const id = store.newImageId();
	await store.saveImage(params.id, id, bytes, type);
	await recordUsage('photo.added', { recipeId: params.id });
	return json({ id }, { status: 201 });
};
