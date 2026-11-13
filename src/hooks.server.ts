import { redirect, type RequestEvent } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { cookieName, getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { decideAccess } from '#lib/server/access.js';
import {
	authDisabled,
	LOCAL_USER,
	SESSION_COOKIE,
	sessionSecret
} from '#lib/server/auth-config.js';
import { readValue } from '#lib/server/session.js';
import { getStore } from '#lib/server/store.js';

/**
 * The request the language is read from. A signed-in user with no language cookie (a new
 * browser or device) gets the language they chose before, stored with their account. The
 * cookie is then missing only on that first visit, so the store is read rarely.
 */
async function requestWithUserLanguage(event: RequestEvent): Promise<Request> {
	const user = event.locals.user;
	if (!user || event.cookies.get(cookieName)) return event.request;
	const language = await getStore()
		.getUserLanguage(user.sub)
		.catch(() => undefined);
	if (!language) return event.request;
	const headers = new Headers(event.request.headers);
	const cookie = headers.get('cookie');
	headers.set('cookie', `${cookie ? `${cookie}; ` : ''}${cookieName}=${language}`);
	return new Request(event.request, { headers });
}

const handleAuth: Handle = async ({ event, resolve }) => {
	const off = authDisabled();
	let user: App.Locals['user'] = off ? LOCAL_USER : null;
	if (!off) {
		const session = readValue<{ sub: string; email?: string }>(
			event.cookies.get(SESSION_COOKIE),
			sessionSecret()
		);
		if (session) user = { sub: session.sub, ...(session.email ? { email: session.email } : {}) };
	}
	event.locals.user = user;

	const access = decideAccess({
		pathname: event.url.pathname,
		method: event.request.method,
		signedIn: user !== null,
		authDisabled: off
	});
	if (access === 'unauthorized') {
		return new Response(JSON.stringify({ error: 'unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}
	if (access === 'sign-in') redirect(303, '/signin');
	return resolve(event);
};

const handleParaglide: Handle = async ({ event, resolve }) =>
	paraglideMiddleware(await requestWithUserLanguage(event), ({ request, locale }) => {
		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
			}
		);
	});

export const handle: Handle = sequence(handleAuth, handleParaglide);
