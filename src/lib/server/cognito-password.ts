/**
 * Sign-in with an email and password, through Cognito's sign-in API. The sign-in form sends the
 * password here over HTTPS and gets an ID token back. The token is then checked by verifyIdToken.
 * Accounts that still have their temporary password get a challenge to choose a new one.
 */

import type { CognitoConfig } from './cognito';

type Fetcher = typeof fetch;

export type PasswordSignIn =
	| { kind: 'tokens'; idToken: string }
	| { kind: 'new-password'; session: string }
	| { kind: 'wrong' }
	| { kind: 'failed' };

export type NewPasswordResult =
	| { kind: 'tokens'; idToken: string }
	| { kind: 'rejected' }
	| { kind: 'expired' }
	| { kind: 'failed' };

interface CognitoReply {
	ok: boolean;
	body: Record<string, unknown>;
}

/** The error name from a Cognito reply, such as "NotAuthorizedException". */
function errorName(body: Record<string, unknown>): string {
	const type = typeof body.__type === 'string' ? body.__type : '';
	return type.split('#').pop() ?? '';
}

async function call(
	config: Pick<CognitoConfig, 'issuer' | 'clientId'>,
	operation: string,
	payload: Record<string, unknown>,
	fetcher: Fetcher
): Promise<CognitoReply> {
	// The issuer is https://cognito-idp.<region>.amazonaws.com/<pool>; the API lives at its origin.
	const endpoint = new URL(config.issuer).origin + '/';
	const response = await fetcher(endpoint, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-amz-json-1.1',
			'x-amz-target': `AWSCognitoIdentityProviderService.${operation}`
		},
		body: JSON.stringify({ ClientId: config.clientId, ...payload })
	});
	const body = ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
	return { ok: response.ok, body };
}

function idTokenOf(body: Record<string, unknown>): string | null {
	const result = body.AuthenticationResult as { IdToken?: unknown } | undefined;
	return typeof result?.IdToken === 'string' ? result.IdToken : null;
}

export async function signInWithPassword(
	config: Pick<CognitoConfig, 'issuer' | 'clientId'>,
	email: string,
	password: string,
	fetcher: Fetcher = fetch
): Promise<PasswordSignIn> {
	const reply = await call(
		config,
		'InitiateAuth',
		{ AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: email, PASSWORD: password } },
		fetcher
	);
	if (!reply.ok) {
		const name = errorName(reply.body);
		return name === 'NotAuthorizedException' || name === 'UserNotFoundException'
			? { kind: 'wrong' }
			: { kind: 'failed' };
	}
	const idToken = idTokenOf(reply.body);
	if (idToken) return { kind: 'tokens', idToken };
	if (
		reply.body.ChallengeName === 'NEW_PASSWORD_REQUIRED' &&
		typeof reply.body.Session === 'string'
	) {
		return { kind: 'new-password', session: reply.body.Session };
	}
	return { kind: 'failed' };
}

export async function respondNewPassword(
	config: Pick<CognitoConfig, 'issuer' | 'clientId'>,
	email: string,
	newPassword: string,
	session: string,
	fetcher: Fetcher = fetch
): Promise<NewPasswordResult> {
	const reply = await call(
		config,
		'RespondToAuthChallenge',
		{
			ChallengeName: 'NEW_PASSWORD_REQUIRED',
			Session: session,
			ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword }
		},
		fetcher
	);
	if (!reply.ok) {
		const name = errorName(reply.body);
		if (name === 'InvalidPasswordException') return { kind: 'rejected' };
		if (name === 'NotAuthorizedException' || name === 'ExpiredCodeException') {
			return { kind: 'expired' };
		}
		return { kind: 'failed' };
	}
	const idToken = idTokenOf(reply.body);
	return idToken ? { kind: 'tokens', idToken } : { kind: 'failed' };
}
