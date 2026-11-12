/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';
import { RECIPE_CACHE } from './lib/recipes/offline-cache';

const sw = self as unknown as ServiceWorkerGlobalScope;

/**
 * Offline reading. The app shell is cached on install. The recipe list, recipe images and
 * the pages already visited are cached as they are read; when offline, the cached copies
 * are used. Editing needs a connection. Sign-in pages are never cached, and recipe data is
 * dropped when the server answers 401 (signed out).
 */

const SHELL = `shell-${version}`;
const DATA = RECIPE_CACHE;
// Each entry is { path } relative to the app root; the cache needs absolute URLs.
const SHELL_URLS = [...immutable, ...assets].map((entry) => `/${entry.path}`);
const SHELL_SET = new Set(SHELL_URLS);

/** A network request that takes longer than this counts as offline. */
const NETWORK_TIMEOUT_MS = 5000;

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(SHELL)
			.then((cache) => cache.addAll(SHELL_URLS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((key) => key !== SHELL && key !== DATA).map((key) => caches.delete(key))
				)
			)
			.then(() => sw.clients.claim())
	);
});

const RECIPE_LIST = /^\/api\/recipes$/;
const RECIPE_IMAGE = /^\/api\/recipes\/[^/]+\/images\/[^/]+$/;

sw.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;
	if (url.pathname.startsWith('/auth/')) return;

	if (SHELL_SET.has(url.pathname)) {
		event.respondWith(cacheFirst(request, SHELL));
	} else if (RECIPE_IMAGE.test(url.pathname)) {
		event.respondWith(cacheFirst(request, DATA));
	} else if (RECIPE_LIST.test(url.pathname)) {
		event.respondWith(networkFirst(request));
	} else if (request.mode === 'navigate') {
		event.respondWith(navigate(request));
	}
});

/** Fetches with a time limit, so a stalled connection is treated as offline. */
function fetchWithLimit(request: Request): Promise<Response> {
	return fetch(request, { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) });
}

/**
 * Looks in the cache by URL only. The Vary header is ignored: shell files are named by
 * content hash, so they cannot change, and matching on Origin missed cached scripts.
 */
async function cacheMatch(request: Request, name: string): Promise<Response | undefined> {
	return caches.match(request, { cacheName: name, ignoreVary: true });
}

async function cacheFirst(request: Request, name: string): Promise<Response> {
	const hit = await cacheMatch(request, name);
	if (hit) return hit;
	const response = await fetchWithLimit(request);
	if (response.ok) {
		const cache = await caches.open(name);
		void cache.put(request, response.clone());
	}
	return response;
}

async function networkFirst(request: Request): Promise<Response> {
	try {
		const response = await fetchWithLimit(request);
		if (response.status === 401) {
			// Signed out: forget the recipes this device kept.
			await caches.delete(DATA);
			return response;
		}
		if (response.ok) {
			const cache = await caches.open(DATA);
			void cache.put(request, response.clone());
		}
		return response;
	} catch {
		const hit = await cacheMatch(request, DATA);
		if (hit) return hit;
		return new Response(JSON.stringify({ error: 'offline' }), {
			status: 503,
			headers: { 'content-type': 'application/json' }
		});
	}
}

async function navigate(request: Request): Promise<Response> {
	try {
		const response = await fetchWithLimit(request);
		const isPage = response.headers.get('content-type')?.includes('text/html') ?? false;
		if (response.ok && !response.redirected && isPage) {
			const cache = await caches.open(DATA);
			void cache.put(request, response.clone());
		}
		return response;
	} catch {
		return (
			(await cacheMatch(request, DATA)) ??
			(await cacheMatch(new Request('/recipes'), DATA)) ??
			Response.error()
		);
	}
}
