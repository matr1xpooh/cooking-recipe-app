import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSafeId } from '#lib/server/recipe-data.js';
import { getStore } from '#lib/server/store.js';

/** GET /api/recipes/<id>/images/<imageId> -> the original image bytes */
export const GET: RequestHandler = async ({ params }) => {
	if (!isSafeId(params.id) || !isSafeId(params.imageId)) error(404, 'not found');
	const image = await getStore().readImage(params.id, params.imageId);
	if (!image) error(404, 'not found');
	return new Response(new Uint8Array(image.bytes), {
		headers: { 'content-type': image.type, 'cache-control': 'no-store' }
	});
};

/** DELETE /api/recipes/<id>/images/<imageId> */
export const DELETE: RequestHandler = async ({ params }) => {
	if (!isSafeId(params.id) || !isSafeId(params.imageId)) error(404, 'not found');
	await getStore().deleteImage(params.id, params.imageId);
	return new Response(null, { status: 204 });
};
