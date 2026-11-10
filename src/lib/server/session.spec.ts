import { describe, expect, it } from 'vitest';
import { readValue, signValue } from './session';

const SECRET = 'x'.repeat(32);
const HOUR = 60 * 60 * 1000;

describe('signed values', () => {
	it('reads back what was signed while it is fresh', () => {
		const token = signValue({ sub: 'u1' }, SECRET, HOUR, 1000);
		expect(readValue<{ sub: string }>(token, SECRET, 1000 + HOUR / 2)).toMatchObject({ sub: 'u1' });
	});

	it('rejects a value after it expires', () => {
		const token = signValue({ sub: 'u1' }, SECRET, HOUR, 1000);
		expect(readValue(token, SECRET, 1000 + HOUR)).toBeNull();
	});

	it('rejects a value signed with another secret', () => {
		const token = signValue({ sub: 'u1' }, SECRET, HOUR);
		expect(readValue(token, 'y'.repeat(32))).toBeNull();
	});

	it('rejects a payload that was changed after signing', () => {
		const token = signValue({ sub: 'u1' }, SECRET, HOUR);
		const [, mac] = token.split('.');
		const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() + HOUR })).toString(
			'base64url'
		);
		expect(readValue(`${forged}.${mac}`, SECRET)).toBeNull();
	});

	it('rejects a missing or malformed value', () => {
		expect(readValue(undefined, SECRET)).toBeNull();
		expect(readValue('no-dot-here', SECRET)).toBeNull();
		expect(readValue('.', SECRET)).toBeNull();
	});
});
