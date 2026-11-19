import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GlossaryRule } from '#lib/recipes/glossary.js';
import { dataDir } from './recipe-data';

/** Translation fixes, kept in glossary.json in the data folder. */

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
	const run = queue.then(task);
	queue = run.catch(() => undefined);
	return run;
}

function file(): string {
	return path.join(dataDir(), 'glossary.json');
}

async function readRules(): Promise<GlossaryRule[]> {
	try {
		return JSON.parse(await readFile(file(), 'utf8')) as GlossaryRule[];
	} catch {
		return [];
	}
}

async function writeRules(rules: GlossaryRule[]): Promise<void> {
	await mkdir(dataDir(), { recursive: true });
	const tmp = `${file()}.tmp`;
	await writeFile(tmp, JSON.stringify(rules, null, 2));
	await rename(tmp, file());
}

export function listGlossary(): Promise<GlossaryRule[]> {
	return serial(readRules);
}

/** Adds a fix, or replaces the one with the same id. */
export function saveGlossaryRule(rule: GlossaryRule): Promise<void> {
	return serial(async () => {
		const rules = (await readRules()).filter((r) => r.id !== rule.id);
		await writeRules([...rules, rule]);
	});
}

/** Removes a fix. Returns false when there is no such fix. */
export function deleteGlossaryRule(id: string): Promise<boolean> {
	return serial(async () => {
		const rules = await readRules();
		const kept = rules.filter((r) => r.id !== id);
		if (kept.length === rules.length) return false;
		await writeRules(kept);
		return true;
	});
}
