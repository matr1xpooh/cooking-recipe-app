import { rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Removes what a run leaves behind: the test S3 folder of the local stack (scripts/local-stack.ts),
 * and the saved sign-in of a deployed run. Works even when the stack was killed.
 */
export default function teardown(): void {
	rmSync(path.resolve('.emulators/s3-test'), { recursive: true, force: true });
	rmSync(path.resolve('.emulators/deployed-auth.json'), { force: true });
}
