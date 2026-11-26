import { rmSync } from 'node:fs';
import path from 'node:path';

/** Removes the test run's S3 folder (scripts/local-stack.ts), even when the stack was killed. */
export default function teardown(): void {
	rmSync(path.resolve('.emulators/s3-test'), { recursive: true, force: true });
}
