/**
 * Runs the app's AWS store against local emulators, so nothing reaches AWS:
 *   - DynamoDB Local (AWS's own emulator, a Java program), downloaded once into .emulators/
 *   - s3rver (an S3 emulator, a Node package) on a local port
 * It creates the table and bucket the app expects (from infra/table.ts), then runs the command
 * given after `--` with the endpoint variables set. The emulators stop when the command exits.
 *
 *   tsx scripts/local-stack.ts -- <command>          tests: in-memory table, temporary files, deleted on exit
 *   tsx scripts/local-stack.ts --persist -- <command> development: data kept in .local-data/
 *
 * Requires Java (a JDK), for DynamoDB Local.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CreateTableCommand, DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import S3rver from 's3rver';
import { tableLayout } from '../infra/table';

// The DynamoDB Local release this was tested with (3.3.2). A different archive is refused.
const DYNAMO_URL = 'https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.tar.gz';
const DYNAMO_SHA256 = '7a94eb65f81aee270738751a4e5e3e6a7ad02a5d25194f55b83e08ec2ba6342b';
const EMULATOR_DIR = path.resolve('.emulators/dynamodb-local');
const REGION = 'eu-west-1';
// Every AWS service the app might call that is not emulated goes to this closed port, so the
// request fails locally instead of reaching AWS.
const NOWHERE = 'http://127.0.0.1:9';

const args = process.argv.slice(2);
const separator = args.indexOf('--');
const flags = separator < 0 ? args : args.slice(0, separator);
const command = separator < 0 ? [] : args.slice(separator + 1);
if (command.length === 0)
	throw new Error('Usage: tsx scripts/local-stack.ts [--persist] -- <command>');

const persist = flags.includes('--persist');
const ports = persist ? { dynamo: 8000, s3: 4566 } : { dynamo: 8766, s3: 4570 };
const names = persist
	? { table: 'recipes-dev', bucket: 'recipes-dev-images' }
	: { table: 'recipes-test', bucket: 'recipes-test-images' };
const dataDir = path.resolve('.local-data');
// Tests use one fixed folder, emptied at the start of each run and removed by e2e/teardown.ts.
// SIGKILL (which Playwright sends) skips exit handlers, so a fixed folder is the reliable way.
const s3Dir = persist ? path.join(dataDir, 's3') : path.resolve('.emulators/s3-test');
const dynamoUrl = `http://127.0.0.1:${ports.dynamo}`;
const s3Url = `http://127.0.0.1:${ports.s3}`;
// s3rver accepts only its built-in account (S3RVER); DynamoDB Local accepts any key.
const credentials = { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' };

/** Fetches DynamoDB Local once and checks it against the pinned checksum. */
async function ensureDynamoLocal(): Promise<void> {
	if (existsSync(path.join(EMULATOR_DIR, 'DynamoDBLocal.jar'))) return;
	const java = spawnSync('java', ['-version']);
	if (java.error) throw new Error('DynamoDB Local needs Java: install a JDK, then run again.');
	const response = await fetch(DYNAMO_URL);
	if (!response.ok) throw new Error(`Downloading DynamoDB Local failed: HTTP ${response.status}`);
	const archive = Buffer.from(await response.arrayBuffer());
	const sha = createHash('sha256').update(archive).digest('hex');
	if (sha !== DYNAMO_SHA256) {
		throw new Error(`DynamoDB Local has checksum ${sha}, not the pinned ${DYNAMO_SHA256}.`);
	}
	mkdirSync(EMULATOR_DIR, { recursive: true });
	const tarball = path.join(EMULATOR_DIR, 'dynamodb-local.tar.gz');
	writeFileSync(tarball, archive);
	const untar = spawnSync('tar', ['-xzf', tarball, '-C', EMULATOR_DIR]);
	rmSync(tarball);
	if (untar.status !== 0) throw new Error('Unpacking DynamoDB Local failed.');
}

const dynamo = new DynamoDBClient({ endpoint: dynamoUrl, region: REGION, credentials });
const s3 = new S3Client({
	endpoint: s3Url,
	region: REGION,
	credentials,
	forcePathStyle: true,
	requestChecksumCalculation: 'WHEN_REQUIRED'
});

async function waitUntil(what: string, ready: () => Promise<unknown>): Promise<void> {
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			await ready();
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}
	throw new Error(`${what} did not start.`);
}

/** The table in DynamoDB's own shape, from the shared layout. */
function createTableInput() {
	const { fields, primaryIndex, globalIndexes } = tableLayout;
	return {
		TableName: names.table,
		BillingMode: 'PAY_PER_REQUEST' as const,
		AttributeDefinitions: Object.entries(fields).map(([name, type]) => ({
			AttributeName: name,
			AttributeType: type === 'string' ? ('S' as const) : ('N' as const)
		})),
		KeySchema: [
			{ AttributeName: primaryIndex.hashKey, KeyType: 'HASH' as const },
			{ AttributeName: primaryIndex.rangeKey, KeyType: 'RANGE' as const }
		],
		GlobalSecondaryIndexes: Object.entries(globalIndexes).map(([name, index]) => ({
			IndexName: name,
			KeySchema: [
				{ AttributeName: index.hashKey, KeyType: 'HASH' as const },
				{ AttributeName: index.rangeKey, KeyType: 'RANGE' as const }
			],
			Projection: index.projection
				? { ProjectionType: 'INCLUDE' as const, NonKeyAttributes: index.projection }
				: { ProjectionType: 'ALL' as const }
		}))
	};
}

const children: ChildProcess[] = [];
let s3Server: S3rver | undefined;
let stopping: Promise<void> | undefined;

/** Ends the run with the given exit code, after the emulators and the app have stopped. */
async function finish(code: number | null): Promise<void> {
	await stop();
	process.exit(code ?? 0);
}

/** Stops the app and both emulators; removes the temporary S3 folder unless it is kept. */
function stop(): Promise<void> {
	stopping ??= (async () => {
		for (const child of children) child.kill('SIGTERM');
		try {
			await s3Server?.close();
		} catch {
			// Already stopped: the folder is still removed below.
		}
		if (!persist) rmSync(s3Dir, { recursive: true, force: true });
	})();
	return stopping;
}

async function main(): Promise<void> {
	await ensureDynamoLocal();
	if (persist) mkdirSync(path.join(dataDir, 'dynamodb'), { recursive: true });
	const dbPath = path.join(dataDir, 'dynamodb');
	if (!persist) rmSync(s3Dir, { recursive: true, force: true });
	mkdirSync(s3Dir, { recursive: true });
	const dynamoProcess = spawn(
		'java',
		[
			'-Djava.library.path=./DynamoDBLocal_lib',
			'-jar',
			'DynamoDBLocal.jar',
			...(persist ? ['-dbPath', dbPath] : ['-inMemory']),
			'-port',
			String(ports.dynamo)
		],
		{ cwd: EMULATOR_DIR, stdio: ['ignore', 'ignore', 'inherit'] }
	);
	children.push(dynamoProcess);
	// Only a DynamoDB Local that stops on its own ends the run; stopping it on purpose does not.
	dynamoProcess.on('exit', () => {
		if (stopping) return;
		console.error('DynamoDB Local stopped unexpectedly.');
		void finish(1);
	});

	await waitUntil('DynamoDB Local', () => dynamo.send(new ListTablesCommand({})));
	try {
		await dynamo.send(new CreateTableCommand(createTableInput()));
	} catch (error) {
		if ((error as { name?: string }).name !== 'ResourceInUseException') throw error;
	}

	s3Server = new S3rver({
		port: ports.s3,
		address: '127.0.0.1',
		directory: s3Dir,
		silent: true,
		resetOnClose: !persist,
		configureBuckets: []
	});
	await s3Server.run();
	try {
		await s3.send(new CreateBucketCommand({ Bucket: names.bucket }));
	} catch (error) {
		const name = (error as { name?: string }).name;
		if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error;
	}

	const env: NodeJS.ProcessEnv = {
		...process.env,
		TABLE_NAME: names.table,
		BUCKET_NAME: names.bucket,
		AWS_REGION: REGION,
		AWS_ACCESS_KEY_ID: credentials.accessKeyId,
		AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
		AWS_ENDPOINT_URL: NOWHERE,
		AWS_ENDPOINT_URL_DYNAMODB: dynamoUrl,
		AWS_ENDPOINT_URL_S3: s3Url,
		AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
		AWS_CONFIG_FILE: '/dev/null',
		AWS_EC2_METADATA_DISABLED: 'true'
	};
	delete env.AWS_SESSION_TOKEN;
	delete env.AWS_PROFILE;

	const app = spawn(command[0], command.slice(1), { env, stdio: 'inherit' });
	children.push(app);
	app.on('exit', (code) => void finish(code));
	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		process.on(signal, () => void finish(0));
	}
}

main().catch(async (error: unknown) => {
	console.error(
		error instanceof Error ? error.message : error,
		(error as { name?: string; $metadata?: unknown }).name,
		(error as { $metadata?: unknown }).$metadata
	);
	await stop();
	process.exit(1);
});
