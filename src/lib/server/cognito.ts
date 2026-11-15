import { createPublicKey, verify, type JsonWebKey as NodeJsonWebKey } from 'node:crypto';

/**
 * Amazon Cognito: the ID token check (RS256 signature against the user pool's public keys,
 * then its claims) and the hosted sign-out page.
 */

export interface CognitoConfig {
	/** https://cognito-idp.<region>.amazonaws.com/<user pool id> */
	issuer: string;
	/** https://<domain prefix>.auth.<region>.amazoncognito.com */
	domain: string;
	clientId: string;
}

export interface Jwk extends NodeJsonWebKey {
	kid: string;
}

export interface VerifiedUser {
	sub: string;
	email?: string;
}

export function logoutUrl(config: CognitoConfig, logoutUri: string): string {
	const url = new URL('/logout', config.domain);
	url.search = new URLSearchParams({
		client_id: config.clientId,
		logout_uri: logoutUri
	}).toString();
	return url.toString();
}

export async function fetchJwks(
	config: CognitoConfig,
	fetcher: typeof fetch = fetch
): Promise<Jwk[]> {
	const response = await fetcher(`${config.issuer}/.well-known/jwks.json`);
	if (!response.ok) throw new Error(`jwks fetch failed: ${response.status}`);
	const body = (await response.json()) as { keys?: Jwk[] };
	return body.keys ?? [];
}

/**
 * Checks an ID token: RS256 signature with the key named by its `kid`, issuer, audience,
 * token use, and expiry. Returns the user, or throws when any check fails.
 */
export function verifyIdToken(
	token: string,
	config: Pick<CognitoConfig, 'issuer' | 'clientId'>,
	keys: Jwk[],
	now = Date.now()
): VerifiedUser {
	const parts = token.split('.');
	if (parts.length !== 3) throw new Error('malformed token');
	const [headerPart, payloadPart, signaturePart] = parts;
	const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as {
		alg?: unknown;
		kid?: unknown;
	};
	if (header.alg !== 'RS256') throw new Error('unexpected algorithm');
	const jwk = keys.find((k) => k.kid === header.kid);
	if (!jwk) throw new Error('unknown signing key');
	const key = createPublicKey({ key: jwk, format: 'jwk' });
	const valid = verify(
		'RSA-SHA256',
		Buffer.from(`${headerPart}.${payloadPart}`),
		key,
		Buffer.from(signaturePart, 'base64url')
	);
	if (!valid) throw new Error('bad signature');

	const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as {
		iss?: unknown;
		aud?: unknown;
		token_use?: unknown;
		exp?: unknown;
		sub?: unknown;
		email?: unknown;
	};
	if (claims.iss !== config.issuer) throw new Error('wrong issuer');
	if (claims.aud !== config.clientId) throw new Error('wrong audience');
	if (claims.token_use !== 'id') throw new Error('not an ID token');
	if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) throw new Error('expired');
	if (typeof claims.sub !== 'string' || claims.sub.length === 0) throw new Error('no subject');
	return {
		sub: claims.sub,
		...(typeof claims.email === 'string' ? { email: claims.email } : {})
	};
}
