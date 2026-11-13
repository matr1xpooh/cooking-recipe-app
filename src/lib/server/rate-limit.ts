/**
 * Token buckets per key (a user and an endpoint). Each bucket holds `capacity` tokens and
 * refills `perMinute` tokens a minute. A safety net only: it is per server instance, and
 * the AWS budget alarm is the real cap on spending.
 */

export interface Limit {
	capacity: number;
	perMinute: number;
}

interface Bucket {
	tokens: number;
	at: number;
}

const buckets = new Map<string, Bucket>();

/** Takes one token for `key`. Returns false when the bucket is empty. */
export function takeToken(key: string, limit: Limit, now = Date.now()): boolean {
	const bucket = buckets.get(key) ?? { tokens: limit.capacity, at: now };
	const refilled = (now - bucket.at) * (limit.perMinute / 60_000);
	bucket.tokens = Math.min(limit.capacity, bucket.tokens + refilled);
	bucket.at = now;
	const allowed = bucket.tokens >= 1;
	if (allowed) bucket.tokens -= 1;
	buckets.set(key, bucket);
	return allowed;
}

/** Limits for the endpoints that spend AWS money or fetch from the web. */
export const LIMITS = {
	translate: { capacity: 20, perMinute: 20 },
	/** Shared by every signed-out visitor, so it is higher: one page load makes several calls. */
	translateAnonymous: { capacity: 60, perMinute: 60 },
	ocr: { capacity: 10, perMinute: 5 },
	import: { capacity: 20, perMinute: 10 },
	importImage: { capacity: 30, perMinute: 15 }
} satisfies Record<string, Limit>;
