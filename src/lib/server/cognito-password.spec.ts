import { describe, expect, it } from 'vitest';
import { respondNewPassword, signInWithPassword } from './cognito-password';

const config = { issuer: 'https://cognito-idp.eu-west-1.amazonaws.com/pool', clientId: 'client' };

/** A fetch that answers once with the given status and body, and records the request. */
function replying(
	status: number,
	body: unknown,
	seen: { url?: string; target?: string; payload?: unknown }
) {
	return async (url: string | URL | Request, init?: RequestInit) => {
		seen.url = String(url);
		const headers = new Headers(init?.headers);
		seen.target = headers.get('x-amz-target') ?? undefined;
		seen.payload = JSON.parse(String(init?.body));
		return new Response(JSON.stringify(body), { status });
	};
}

describe('signInWithPassword', () => {
	it('asks Cognito for an ID token with the password flow', async () => {
		const seen: { url?: string; target?: string; payload?: unknown } = {};
		const result = await signInWithPassword(
			config,
			'a@example.com',
			'pw',
			replying(200, { AuthenticationResult: { IdToken: 'id.token.here' } }, seen)
		);
		expect(result).toEqual({ kind: 'tokens', idToken: 'id.token.here' });
		expect(seen.url).toBe('https://cognito-idp.eu-west-1.amazonaws.com/');
		expect(seen.target).toBe('AWSCognitoIdentityProviderService.InitiateAuth');
		expect(seen.payload).toEqual({
			ClientId: 'client',
			AuthFlow: 'USER_PASSWORD_AUTH',
			AuthParameters: { USERNAME: 'a@example.com', PASSWORD: 'pw' }
		});
	});

	it('reports a wrong password or unknown email as wrong', async () => {
		const seen = {};
		const result = await signInWithPassword(
			config,
			'a@example.com',
			'nope',
			replying(
				400,
				{ __type: 'com.amazonaws.cognito.identity.idp.model#NotAuthorizedException' },
				seen
			)
		);
		expect(result).toEqual({ kind: 'wrong' });
	});

	it('asks for a new password when the account has a temporary one', async () => {
		const result = await signInWithPassword(
			config,
			'a@example.com',
			'temp',
			replying(200, { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 'sess' }, {})
		);
		expect(result).toEqual({ kind: 'new-password', session: 'sess' });
	});

	it('reports other problems as failed', async () => {
		const result = await signInWithPassword(
			config,
			'a@example.com',
			'pw',
			replying(400, { __type: 'TooManyRequestsException' }, {})
		);
		expect(result).toEqual({ kind: 'failed' });
	});
});

describe('respondNewPassword', () => {
	it('returns the ID token once the new password is accepted', async () => {
		const seen: { url?: string; target?: string; payload?: unknown } = {};
		const result = await respondNewPassword(
			config,
			'a@example.com',
			'New-pass1!',
			'sess',
			replying(200, { AuthenticationResult: { IdToken: 'id.token.here' } }, seen)
		);
		expect(result).toEqual({ kind: 'tokens', idToken: 'id.token.here' });
		expect(seen.target).toBe('AWSCognitoIdentityProviderService.RespondToAuthChallenge');
	});

	it('reports a password that breaks the rules as rejected', async () => {
		const result = await respondNewPassword(
			config,
			'a@example.com',
			'short',
			'sess',
			replying(400, { __type: 'InvalidPasswordException' }, {})
		);
		expect(result).toEqual({ kind: 'rejected' });
	});

	it('reports an expired challenge as expired', async () => {
		const result = await respondNewPassword(
			config,
			'a@example.com',
			'New-pass1!',
			'sess',
			replying(400, { __type: 'NotAuthorizedException' }, {})
		);
		expect(result).toEqual({ kind: 'expired' });
	});
});
