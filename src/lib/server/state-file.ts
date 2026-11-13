import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Language } from '#lib/recipes/languages.js';
import { dataDir } from './recipe-data';

/**
 * The file backend for the small state the AWS store keeps in DynamoDB: the machine
 * translation cache and each user's language. Stored in state.json under the data
 * directory. Development only, so the cache is not bounded here.
 */

interface State {
	translations: Record<string, string>;
	languages: Record<string, Language>;
}

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
	const run = queue.then(task);
	queue = run.catch(() => undefined);
	return run;
}

function file(): string {
	return path.join(dataDir(), 'state.json');
}

async function readState(): Promise<State> {
	try {
		const parsed = JSON.parse(await readFile(file(), 'utf8')) as Partial<State>;
		return { translations: parsed.translations ?? {}, languages: parsed.languages ?? {} };
	} catch {
		return { translations: {}, languages: {} };
	}
}

async function writeState(state: State): Promise<void> {
	await mkdir(dataDir(), { recursive: true });
	const tmp = `${file()}.tmp`;
	await writeFile(tmp, JSON.stringify(state, null, 2));
	await rename(tmp, file());
}

export function getCachedTranslation(key: string): Promise<string | undefined> {
	return serial(async () => (await readState()).translations[key]);
}

export function setCachedTranslation(key: string, text: string): Promise<void> {
	return serial(async () => {
		const state = await readState();
		state.translations[key] = text;
		await writeState(state);
	});
}

export function getUserLanguage(userSub: string): Promise<Language | undefined> {
	return serial(async () => (await readState()).languages[userSub]);
}

export function setUserLanguage(userSub: string, language: Language): Promise<void> {
	return serial(async () => {
		const state = await readState();
		state.languages[userSub] = language;
		await writeState(state);
	});
}
