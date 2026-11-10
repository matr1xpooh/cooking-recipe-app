import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorizeUrl, newAttempt, verifyIdToken, type CognitoConfig, type Jwk } from './cognito';

const config: CognitoConfig = {
	issuer: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_TEST',
	domain: 'https://recipes-test.auth.eu-west-1.amazoncognito.com',
	clientId: 'client-123'
};
const NOW = 1_700_000_000_000;

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keys: Jwk[] = [{ ...(publicKey.export({ format: 'jwk' }) as JsonWebKey), kid: 'k1' } as Jwk];

function token(
	claims: Record<string, unknown>,
	options: { alg?: string; kid?: string; key?: typeof privateKey } = {}
): string {
	const header = Buffer.from(
		JSON.stringify({ alg: options.alg ?? 'RS256', kid: options.kid ?? 'k1' })
	).toString('base64url');
	const payload = Buffer.from(
		JSON.stringify({
			iss: config.issuer,
			aud: config.clientId,
			token_use: 'id',
			sub: 'user-1',
			email: 'a@example.com',
			exp: NOW / 1000 + 3600,
			...claims
		})
	).toString('base64url');
	const data = Buffer.from(`${header}.${payload}`);
	const signature = sign('RSA-SHA256', data, options.key ?? privateKey).toString('base64url');
	return `${header}.${payload}.${signature}`;
}

describe('verifyIdToken', () => {
	it('accepts a correctly signed, unexpired token for this app', () => {
		expect(verifyIdToken(token({}), config, keys, NOW)).toEqual({
			sub: 'user-1',
			email: 'a@example.com'
		});
	});

	it('rejects a token signed by another key', () => {
		const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
		expect(() => verifyIdToken(token({}, { key: other }), config, keys, NOW)).toThrow(
			'bad signature'
		);
	});

	it('rejects a token for another app', () => {
		expect(() => verifyIdToken(token({ aud: 'someone-else' }), config, keys, NOW)).toThrow(
			'wrong audience'
		);
	});

	it('rejects a token from another issuer', () => {
		expect(() => verifyIdToken(token({ iss: 'https://evil.example' }), config, keys, NOW)).toThrow(
			'wrong issuer'
		);
	});

	it('rejects an access token used in place of an ID token', () => {
		expect(() => verifyIdToken(token({ token_use: 'access' }), config, keys, NOW)).toThrow(
			'not an ID token'
		);
	});

	it('rejects an expired token', () => {
		expect(() => verifyIdToken(token({ exp: NOW / 1000 - 1 }), config, keys, NOW)).toThrow(
			'expired'
		);
	});

	it('rejects a non-RS256 algorithm and an unknown key id', () => {
		expect(() => verifyIdToken(token({}, { alg: 'HS256' }), config, keys, NOW)).toThrow(
			'unexpected algorithm'
		);
		expect(() => verifyIdToken(token({}, { kid: 'other' }), config, keys, NOW)).toThrow(
			'unknown signing key'
		);
	});
});

describe('sign-in attempt', () => {
	it('uses an S256 challenge that matches the verifier', () => {
		const attempt = newAttempt();
		const expected = createHash('sha256').update(attempt.verifier).digest('base64url');
		expect(attempt.challenge).toBe(expected);
		expect(attempt.verifier.length).toBeGreaterThanOrEqual(43);
	});

	it('builds the Cognito authorize URL with PKCE and state', () => {
		const url = new URL(
			authorizeUrl(config, 'https://app.example/auth/callback', { state: 's1', challenge: 'c1' })
		);
		expect(url.origin + url.pathname).toBe(`${config.domain}/oauth2/authorize`);
		expect(url.searchParams.get('client_id')).toBe(config.clientId);
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
		expect(url.searchParams.get('state')).toBe('s1');
		expect(url.searchParams.get('code_challenge')).toBe('c1');
	});
});
