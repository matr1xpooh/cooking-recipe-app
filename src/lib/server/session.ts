import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, expiring values for cookies: `<base64url payload>.<base64url HMAC-SHA256>`.
 * The payload is JSON with an `exp` time in milliseconds. Verification fails for any
 * change to the payload, a wrong secret, or an expired value.
 */

function b64url(input: Buffer | string): string {
	return Buffer.from(input).toString('base64url');
}

function mac(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signValue(
	data: Record<string, unknown>,
	secret: string,
	maxAgeMs: number,
	now = Date.now()
): string {
	const payload = b64url(JSON.stringify({ ...data, exp: now + maxAgeMs }));
	return `${payload}.${mac(payload, secret)}`;
}

/** The data signed into `token`, or null when it is missing, forged, malformed or expired. */
export function readValue<T extends Record<string, unknown>>(
	token: string | undefined,
	secret: string,
	now = Date.now()
): T | null {
	if (!token) return null;
	const dot = token.indexOf('.');
	if (dot < 0) return null;
	const payload = token.slice(0, dot);
	const given = Buffer.from(token.slice(dot + 1));
	const expected = Buffer.from(mac(payload, secret));
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	let data: unknown;
	try {
		data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (typeof data !== 'object' || data === null) return null;
	const { exp } = data as { exp?: unknown };
	if (typeof exp !== 'number' || exp <= now) return null;
	return data as T;
}
