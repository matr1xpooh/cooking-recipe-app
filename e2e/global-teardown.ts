import { rmSync } from 'node:fs';

/** Removes the run's data folder (recipes and photos made by the tests). */
export default function globalTeardown(): void {
	const dir = process.env.E2E_DATA_DIR;
	if (dir) rmSync(dir, { recursive: true, force: true });
}
