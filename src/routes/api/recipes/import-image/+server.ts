import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ImportError, fetchPublicImage } from '#lib/server/recipe-import.js';

/**
 * GET /api/recipes/import-image?url=... -> a recipe's picture, fetched from the public
 * web with the same address checks as a page. Only PNG and JPEG are returned.
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const { bytes, type } = await fetchPublicImage(url.searchParams.get('url') ?? '');
		return new Response(new Uint8Array(bytes), {
			headers: { 'content-type': type, 'cache-control': 'no-store' }
		});
	} catch (caught) {
		if (caught instanceof ImportError) error(caught.status === 400 ? 400 : 502, caught.key);
		throw caught;
	}
};
