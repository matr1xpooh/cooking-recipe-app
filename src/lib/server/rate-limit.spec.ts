import { describe, expect, it } from 'vitest';
import { takeToken } from './rate-limit';

describe('takeToken', () => {
	it('allows up to the capacity, then refuses', () => {
		const limit = { capacity: 3, perMinute: 1 };
		const key = 'test:capacity';
		expect([takeToken(key, limit, 0), takeToken(key, limit, 0), takeToken(key, limit, 0)]).toEqual([
			true,
			true,
			true
		]);
		expect(takeToken(key, limit, 0)).toBe(false);
	});

	it('refills over time at the per-minute rate', () => {
		const limit = { capacity: 1, perMinute: 60 };
		const key = 'test:refill';
		expect(takeToken(key, limit, 0)).toBe(true);
		expect(takeToken(key, limit, 0)).toBe(false);
		expect(takeToken(key, limit, 1000)).toBe(true);
	});

	it('keeps separate buckets for separate keys', () => {
		const limit = { capacity: 1, perMinute: 1 };
		expect(takeToken('test:alice', limit, 0)).toBe(true);
		expect(takeToken('test:alice', limit, 0)).toBe(false);
		expect(takeToken('test:bob', limit, 0)).toBe(true);
	});
});
