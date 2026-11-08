import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	deleteOverride,
	getOverride,
	removeOverridesFor,
	setOverride
} from './translation-overrides';
import { isTranslatedFields } from '#lib/recipes/translation-fields.js';

const fields = { title: 'Sopa', ingredients: ['agua'], steps: ['Hervir'], notes: '' };

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'overrides-'));
	process.env.RECIPE_DATA_DIR = dir;
});
afterEach(async () => {
	delete process.env.RECIPE_DATA_DIR;
	await rm(dir, { recursive: true, force: true });
});

describe('edited translations', () => {
	it('keeps an edit per recipe and language, and deletes it on reset', async () => {
		await setOverride('r1', 'es', { hash: 'h1', fields });
		expect(await getOverride('r1', 'es')).toEqual({ hash: 'h1', fields });
		expect(await getOverride('r1', 'ca')).toBeUndefined();
		await deleteOverride('r1', 'es');
		expect(await getOverride('r1', 'es')).toBeUndefined();
	});

	it('removes all edits of a deleted recipe', async () => {
		await setOverride('r1', 'es', { hash: 'h1', fields });
		await setOverride('r1', 'ru', { hash: 'h1', fields });
		await removeOverridesFor('r1');
		expect(await getOverride('r1', 'ru')).toBeUndefined();
	});
});

describe('translated fields', () => {
	it('accepts the field shape and rejects others', () => {
		expect(isTranslatedFields(fields)).toBe(true);
		expect(isTranslatedFields({ ...fields, steps: 'not a list' })).toBe(false);
		expect(isTranslatedFields({ ...fields, title: 42 })).toBe(false);
	});
});
