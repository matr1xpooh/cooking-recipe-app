import type { CognitoConfig } from './cognito';

/**
 * Settings from the environment. Auth is on unless AUTH=off is set explicitly; there is
 * no default bypass, so a deployed server never runs without sign-in by accident.
 */

export const SESSION_COOKIE = 'recipes_session';
export const ATTEMPT_COOKIE = 'recipes_signin';
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const ATTEMPT_MAX_AGE_MS = 10 * 60 * 1000;

/** The user every request is treated as when auth is off (local development only). */
export const LOCAL_USER = { sub: 'local' };

export function authDisabled(): boolean {
	return process.env.AUTH === 'off';
}

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

export function cognitoConfig(): CognitoConfig {
	return {
		issuer: required('COGNITO_ISSUER'),
		domain: required('COGNITO_DOMAIN'),
		clientId: required('COGNITO_CLIENT_ID')
	};
}

export function sessionSecret(): string {
	const secret = required('SESSION_SECRET');
	if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
	return secret;
}
