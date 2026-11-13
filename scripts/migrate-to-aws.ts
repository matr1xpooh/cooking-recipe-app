/**
 * Copies the local data folder (recipes, translations, photos) into the AWS store.
 *
 *   npm run migrate:aws -- --dry-run   reads the data folder and reports; writes nothing
 *   npm run migrate:aws                writes to DynamoDB and S3
 *
 * A real run needs TABLE_NAME and BUCKET_NAME (the deployed values, see README
 * "Deploying") and AWS credentials for the account. It is safe to run again.
 */
import { parseArgs } from 'node:util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { createAwsStore } from '#lib/server/aws-store.js';
import { dataDir } from '#lib/server/recipe-data.js';
import { applyMigration, planMigration } from '#lib/server/migrate.js';

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } });

const dir = dataDir();
const plan = await planMigration(dir);

console.log(`Data folder: ${dir}`);
console.log(
	`Recipes: ${plan.recipes.length}, photos: ${plan.images.length}, ` +
		`edited translations: ${plan.overrides.length}`
);
for (const problem of plan.problems) console.warn(`  left out: ${problem}`);

if (values['dry-run']) {
	console.log('Dry run: nothing was written.');
	process.exit(0);
}

const table = process.env.TABLE_NAME;
const bucket = process.env.BUCKET_NAME;
if (!table || !bucket) {
	console.error('TABLE_NAME and BUCKET_NAME must be set for a real run.');
	process.exit(1);
}

const store = createAwsStore({
	table,
	bucket,
	dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
	s3: new S3Client({})
});
await applyMigration(plan, store);
console.log(`Copied to ${table} and ${bucket}. Running it again is safe.`);
