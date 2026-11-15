import { ImportError } from './recipe-import';

const API = 'https://www.googleapis.com/youtube/v3/videos';
const TIMEOUT_MS = 10_000;

/** The video id in a YouTube address: watch?v=, youtu.be/, shorts/, embed/ or live/. */
export function youtubeVideoId(url: URL): string | null {
	const host = url.hostname.toLowerCase();
	let id: string | null;
	if (host === 'youtu.be') {
		id = url.pathname.split('/')[1] ?? null;
	} else {
		const v = url.searchParams.get('v');
		if (v) id = v;
		else {
			const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
			id = match ? match[1] : null;
		}
	}
	return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

export interface YouTubeVideo {
	title: string;
	/** The description as the video's owner wrote it. Null when the video is not found. */
	description: string | null;
}

/**
 * The title and description of a video, from the YouTube Data API. Unlike the watch page,
 * this works from any server, so it does not depend on YouTube's consent or bot checks.
 */
export async function fetchYouTubeVideo(id: string, apiKey: string): Promise<YouTubeVideo> {
	const query = new URLSearchParams({ part: 'snippet', id, key: apiKey });
	let res: Response;
	try {
		res = await fetch(`${API}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch {
		throw new ImportError('page_unreachable');
	}
	if (!res.ok) {
		await res.body?.cancel();
		throw new ImportError('page_unreachable');
	}
	const body = (await res.json().catch(() => null)) as {
		items?: { snippet?: { title?: unknown; description?: unknown } }[];
	} | null;
	const snippet = body?.items?.[0]?.snippet;
	if (!snippet) return { title: '', description: null };
	return {
		title: typeof snippet.title === 'string' ? snippet.title : '',
		description: typeof snippet.description === 'string' ? snippet.description : null
	};
}
