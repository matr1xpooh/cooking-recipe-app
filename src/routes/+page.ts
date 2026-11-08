import { redirect } from '@sveltejs/kit';

/** The home address goes straight to the recipe list. */
export function load() {
	redirect(307, '/recipes');
}
