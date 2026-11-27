import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handler, invitationLocale, renderInvitation } from './invite-message';

const APP = 'https://recipes.example.test';

function invite(locale?: string) {
	return {
		triggerSource: 'CustomMessage_AdminCreateUser',
		request: {
			userAttributes: (locale === undefined ? {} : { locale }) as Record<string, string>,
			usernameParameter: '{username}',
			codeParameter: '{####}'
		},
		response: {} as { emailSubject?: string; emailMessage?: string; smsMessage?: string }
	};
}

describe('invitation language', () => {
	it('takes the language from the locale, ignoring region and case', () => {
		expect(invitationLocale('es')).toBe('es');
		expect(invitationLocale('ca-ES')).toBe('ca');
		expect(invitationLocale('RU')).toBe('ru');
	});

	it('falls back to English for anything else or nothing', () => {
		expect(invitationLocale(undefined)).toBe('en');
		expect(invitationLocale('')).toBe('en');
		expect(invitationLocale('fr')).toBe('en');
	});
});

describe('invitation text', () => {
	const languages = ['en', 'es', 'ca', 'ru'] as const;

	for (const locale of languages) {
		it(`${locale}: keeps Cognito's placeholders and fills in the site address`, () => {
			const { subject, body, sms } = renderInvitation(locale, APP);
			expect(subject.length).toBeGreaterThan(0);
			for (const text of [body, sms]) {
				expect(text).toContain('{username}');
				expect(text).toContain('{####}');
				expect(text).toContain(`${APP}/signin`);
				expect(text).not.toContain('{APP}');
			}
			expect(body).toContain(`${APP}/install`);
		});
	}

	it('the texts differ by language', () => {
		const subjects = languages.map((l) => renderInvitation(l, APP).subject);
		expect(new Set(subjects).size).toBe(languages.length);
	});
});

describe('the custom message trigger', () => {
	const saved = process.env.APP_ORIGIN;
	beforeEach(() => {
		process.env.APP_ORIGIN = APP + '/';
	});
	afterEach(() => {
		if (saved === undefined) delete process.env.APP_ORIGIN;
		else process.env.APP_ORIGIN = saved;
	});

	it('writes the Spanish invitation for a Spanish user', () => {
		const event = handler(invite('es'));
		expect(event.response.emailSubject).toContain('Tu mesa');
		expect(event.response.emailMessage).toContain(`${APP}/signin`);
		expect(event.response.emailMessage).toContain('{####}');
	});

	it('writes English when the user has no locale', () => {
		const event = handler(invite());
		expect(event.response.emailSubject).toContain('Your table is set');
	});

	it('leaves other messages alone, such as a password reset', () => {
		const reset = { ...invite('es'), triggerSource: 'CustomMessage_ForgotPassword' };
		const event = handler(reset);
		expect(event.response).toEqual({});
	});
});
