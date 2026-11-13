import { afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileStore } from './store';
import { describeStoreContract } from './store-contract';

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'store-file-'));
	process.env.RECIPE_DATA_DIR = dir;
});
afterEach(async () => {
	delete process.env.RECIPE_DATA_DIR;
	await rm(dir, { recursive: true, force: true });
});

describeStoreContract('file store', async () => ({
	store: fileStore,
	cleanup: async () => {}
}));
