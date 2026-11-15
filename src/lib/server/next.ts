/**
 * Where to go after signing in. Only a path on this site is allowed, so a link cannot send a
 * signed-in user to another site.
 */
export function safeNext(value: string | null | undefined): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
		return '/';
	}
	return value;
}
