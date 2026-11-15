import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchYouTubeVideo, youtubeVideoId } from './youtube-api';
import { parseHttpUrl } from './recipe-import';

describe('youtubeVideoId', () => {
	it.each([
		['https://www.youtube.com/watch?v=7qo9ipy98gw', '7qo9ipy98gw'],
		['https://youtu.be/7qo9ipy98gw', '7qo9ipy98gw'],
		['https://www.youtube.com/shorts/7qo9ipy98gw', '7qo9ipy98gw'],
		['https://www.youtube.com/embed/7qo9ipy98gw?start=5', '7qo9ipy98gw']
	])('reads the id from %s', (raw, id) => {
		expect(youtubeVideoId(parseHttpUrl(raw))).toBe(id);
	});

	it('returns null when there is no id', () => {
		expect(youtubeVideoId(parseHttpUrl('https://www.youtube.com/'))).toBeNull();
	});
});

describe('fetchYouTubeVideo', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('reads the title and description from the API response', async () => {
		let asked = '';
		vi.stubGlobal('fetch', async (url: string) => {
			asked = url;
			return Response.json({
				items: [{ snippet: { title: 'Торт', description: 'Ингредиенты\n\nСахар 150 г' } }]
			});
		});
		const video = await fetchYouTubeVideo('7qo9ipy98gw', 'KEY');
		expect(video).toEqual({ title: 'Торт', description: 'Ингредиенты\n\nСахар 150 г' });
		expect(asked).toContain('id=7qo9ipy98gw');
		expect(asked).toContain('key=KEY');
	});

	it('returns no description when the video is not found', async () => {
		vi.stubGlobal('fetch', async () => Response.json({ items: [] }));
		expect(await fetchYouTubeVideo('7qo9ipy98gw', 'KEY')).toEqual({
			title: '',
			description: null
		});
	});

	it('reports page_unreachable when the API refuses the request', async () => {
		vi.stubGlobal('fetch', async () => new Response('denied', { status: 403 }));
		await expect(fetchYouTubeVideo('7qo9ipy98gw', 'KEY')).rejects.toMatchObject({
			key: 'page_unreachable'
		});
	});
});
