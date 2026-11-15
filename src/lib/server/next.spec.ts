import { describe, expect, it } from 'vitest';
import { safeNext } from './next';

describe('safeNext', () => {
	it('keeps a path on this site', () => {
		expect(safeNext('/recipes/abc?x=1')).toBe('/recipes/abc?x=1');
	});

	it.each(['https://evil.example/', '//evil.example', '/\\evil.example', 'recipes', '', null])(
		'falls back to the home page for %j',
		(value) => {
			expect(safeNext(value)).toBe('/');
		}
	);
});
