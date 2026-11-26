/**
 * Runs the end-to-end tests against a throwaway deployment of the app, then removes it:
 *   1. deploys the `e2e` stage (its own table, bucket, user pool and site; never production)
 *   2. creates a test user with a random password, and signs in through the app's own form
 *   3. runs the same Playwright suite as the local run, against the deployed site
 *   4. always deletes the test user and removes the stage, even when a step fails
 *
 * Run with `npm run test:e2e:deployed`. The first deploy creates real AWS resources.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const STAGE = 'e2e';

function run(command: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
	const result = spawnSync(command, args, {
		env: { ...process.env, ...env },
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit']
	});
	if (result.status !== 0)
		throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status})`);
	return result.stdout;
}

/** Runs a command with the stage's linked resources and AWS credentials (sst shell). */
function onStage(args: string[], env: NodeJS.ProcessEnv = {}): string {
	return run('npx', ['sst', 'shell', '--stage', STAGE, '--', ...args], env);
}

const secret = randomBytes(24).toString('base64url');
const email = `e2e-${randomBytes(4).toString('hex')}@example.test`;
// Always has a lowercase letter, an uppercase letter, a digit and a symbol, to meet the pool policy.
const password = randomBytes(18).toString('base64url') + 'aA1!';
let code = 1;
let deployed = false;

try {
	// The stage's own secrets. The YouTube key is not used by the tests; it only has to exist.
	run('npx', ['sst', 'secret', 'set', 'SessionSecret', secret, '--stage', STAGE]);
	run('npx', ['sst', 'secret', 'set', 'YouTubeApiKey', 'unused-by-e2e', '--stage', STAGE]);

	run('npx', ['sst', 'deploy', '--stage', STAGE]);
	deployed = true;

	onStage(['tsx', 'scripts/e2e-user.ts', 'create'], { E2E_EMAIL: email, E2E_PASSWORD: password });
	const siteUrl = onStage(['node', '-p', 'Resource.Site.url']).trim();

	const tests = spawnSync('npx', ['playwright', 'test'], {
		env: { ...process.env, E2E_BASE_URL: siteUrl, E2E_EMAIL: email, E2E_PASSWORD: password },
		stdio: 'inherit'
	});
	code = tests.status ?? 1;
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
} finally {
	if (deployed) {
		try {
			onStage(['tsx', 'scripts/e2e-user.ts', 'delete'], { E2E_EMAIL: email });
		} catch (error) {
			console.error(
				'Could not delete the test user:',
				error instanceof Error ? error.message : error
			);
		}
	}
	// Removing the stage deletes everything it created, including the test user's pool.
	spawnSync('npx', ['sst', 'remove', '--stage', STAGE], { stdio: 'inherit' });
}

process.exit(code);
