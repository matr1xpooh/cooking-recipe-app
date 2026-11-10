import { redirect } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { decideAccess } from '#lib/server/access.js';
import {
	authDisabled,
	LOCAL_USER,
	SESSION_COOKIE,
	sessionSecret
} from '#lib/server/auth-config.js';
import { readValue } from '#lib/server/session.js';

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

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
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
