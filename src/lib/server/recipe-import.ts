import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { ImportErrorKey } from '#lib/recipes/import.js';

const MAX_REDIRECTS = 3;
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;

const STATUS: Record<ImportErrorKey, number> = {
	url_invalid: 400,
	url_not_allowed: 400,
	page_unreachable: 502,
	page_too_large: 413,
	no_recipe_found: 422
};

export class ImportError extends Error {
	readonly status: number;

	constructor(readonly key: ImportErrorKey) {
		super(key);
		this.status = STATUS[key];
	}
}

function ipv4Octets(ip: string): number[] | null {
	if (isIP(ip) !== 4) return null;
	return ip.split('.').map(Number);
}

/** True for loopback, private, link-local, carrier-grade NAT, and unspecified IPv4 addresses. */
function isPrivateIPv4(octets: number[]): boolean {
	const [a, b] = octets;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		a >= 224
	);
}

/** True when the IP must not be fetched: loopback, private, link-local, and similar ranges. */
export function isPrivateAddress(ip: string): boolean {
	const v4 = ipv4Octets(ip);
	if (v4) return isPrivateIPv4(v4);

	const lower = ip.toLowerCase();
	// IPv4-mapped IPv6, dotted (::ffff:10.0.0.1) or hex (::ffff:a00:1)
	const mappedDotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mappedDotted) return isPrivateAddress(mappedDotted[1]);
	const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
	if (mappedHex) {
		const high = parseInt(mappedHex[1], 16);
		const low = parseInt(mappedHex[2], 16);
		return isPrivateIPv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
	}

	return (
		lower === '::' ||
		lower === '::1' ||
		/^f[cd][0-9a-f]{2}:/.test(lower) || // fc00::/7 unique local
		/^fe[89ab][0-9a-f]:/.test(lower) // fe80::/10 link-local
	);
}

/** Parses an http(s) URL, or throws url_invalid. */
export function parseHttpUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new ImportError('url_invalid');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new ImportError('url_invalid');
	}
	return url;
}

async function assertPublicHost(hostname: string): Promise<void> {
	// URL.hostname keeps brackets around IPv6 literals.
	const bare = hostname.replace(/^\[(.*)\]$/, '$1');
	const addresses = isIP(bare)
		? [bare]
		: (await lookup(bare, { all: true }).catch(() => [])).map((a) => a.address);
	if (addresses.length === 0) throw new ImportError('page_unreachable');
	if (addresses.some(isPrivateAddress)) throw new ImportError('url_not_allowed');
}

async function readLimited(res: Response): Promise<string> {
	if (!res.body) return '';
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_BYTES) {
			await reader.cancel();
			throw new ImportError('page_too_large');
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Fetches a public web page's HTML. Each redirect target is checked against
 * the address rules, so a redirect cannot reach a private host.
 */
export async function fetchPublicPage(raw: string): Promise<string> {
	let url = parseHttpUrl(raw);

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		await assertPublicHost(url.hostname);

		let res: Response;
		try {
			res = await fetch(url, {
				redirect: 'manual',
				signal: AbortSignal.timeout(TIMEOUT_MS),
				headers: {
					accept: 'text/html,application/xhtml+xml',
					'user-agent': 'cooking-recipe-app (recipe import)'
				}
			});
		} catch {
			throw new ImportError('page_unreachable');
		}

		const location = res.headers.get('location');
		if (res.status >= 300 && res.status < 400 && location) {
			await res.body?.cancel();
			url = parseHttpUrl(new URL(location, url).toString());
			continue;
		}
		if (!res.ok) {
			await res.body?.cancel();
			throw new ImportError('page_unreachable');
		}
		return readLimited(res);
	}

	throw new ImportError('page_unreachable');
}
