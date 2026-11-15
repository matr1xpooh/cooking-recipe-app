import { cognitoConfig } from './auth-config';
import { fetchJwks, type Jwk } from './cognito';

const KEY_TTL_MS = 60 * 60 * 1000;
let keys: { at: number; list: Jwk[] } | null = null;

/** The user pool's public keys, kept for an hour so each sign-in does not fetch them. */
export async function signingKeys(): Promise<Jwk[]> {
	if (keys && Date.now() - keys.at < KEY_TTL_MS) return keys.list;
	const list = await fetchJwks(cognitoConfig());
	keys = { at: Date.now(), list };
	return list;
}
