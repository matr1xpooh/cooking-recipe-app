/** Languages recipes can be written in. Matches the app's UI locales. */
export const LANGUAGES = ['en', 'es', 'ca', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
	return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export const LANGUAGE_NAMES: Record<Language, string> = {
	en: 'English',
	es: 'Español',
	ca: 'Català',
	ru: 'Русский'
};
