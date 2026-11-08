import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Language } from '#lib/recipes/languages.js';
import type { RecipeFields } from '#lib/recipes/translation-fields.js';
import { dataDir } from './recipe-data';

/**
 * Translations edited by hand, kept apart from the machine translations. Stored in
 * translations.json: recipe id -> language -> { hash, fields }. `hash` is the source
 * text the translation was made from, so a later change to the recipe can be noticed.
 */

export interface TranslationOverride {
	hash: string;
	fields: RecipeFields;
}

type Store = Record<string, Partial<Record<Language, TranslationOverride>>>;

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
	const run = queue.then(task);
	queue = run.catch(() => undefined);
	return run;
}

function file(): string {
	return path.join(dataDir(), 'translations.json');
}

async function readStore(): Promise<Store> {
	try {
		return JSON.parse(await readFile(file(), 'utf8')) as Store;
	} catch {
		return {};
	}
}

async function writeStore(store: Store): Promise<void> {
	await mkdir(dataDir(), { recursive: true });
	const tmp = `${file()}.tmp`;
	await writeFile(tmp, JSON.stringify(store, null, 2));
	await rename(tmp, file());
}

export function getOverride(
	recipeId: string,
	language: Language
): Promise<TranslationOverride | undefined> {
	return serial(async () => (await readStore())[recipeId]?.[language]);
}

export function setOverride(
	recipeId: string,
	language: Language,
	override: TranslationOverride
): Promise<void> {
	return serial(async () => {
		const store = await readStore();
		store[recipeId] = { ...store[recipeId], [language]: override };
		await writeStore(store);
	});
}

export function deleteOverride(recipeId: string, language: Language): Promise<void> {
	return serial(async () => {
		const store = await readStore();
		if (store[recipeId]) delete store[recipeId][language];
		await writeStore(store);
	});
}

/** Forgets every edited translation of a recipe, when the recipe is deleted. */
export function removeOverridesFor(recipeId: string): Promise<void> {
	return serial(async () => {
		const store = await readStore();
		if (!(recipeId in store)) return;
		delete store[recipeId];
		await writeStore(store);
	});
}
