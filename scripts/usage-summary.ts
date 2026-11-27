/**
 * What happened over the last few days: counts per action, and per recipe. No person is
 * recorded, so none is shown.
 *
 *   npx sst shell --stage production -- tsx scripts/usage-summary.ts [days]
 *
 * days defaults to 7. Recipe names are read from the recipes as they are now, so a renamed
 * recipe shows its new name and a deleted one shows "(deleted)". Run through `sst shell`, so
 * Resource.Table is set.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Resource } from 'sst';
import { USAGE_EVENTS, readActivity, type ActivityRecord } from '../src/lib/server/usage.ts';

const days = Number(process.argv[2] ?? 7);
if (!Number.isInteger(days) || days < 1 || days > 400) {
	throw new Error('days must be a whole number from 1 to 400');
}

const table = Resource.Table.name;
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-west-1' }));
const records = await readActivity({ table, dynamo }, days);

/** A recipe's current title, read from the recipe itself. */
async function titleOf(recipeId: string): Promise<string> {
	const item = await dynamo.send(
		new GetCommand({ TableName: table, Key: { pk: `RECIPE#${recipeId}`, sk: 'META' } })
	);
	if (!item.Item) return '(deleted)';
	const data = typeof item.Item.data === 'string' ? JSON.parse(item.Item.data) : item.Item.data;
	return String(data?.title ?? '(untitled)');
}

function countEvents(list: ActivityRecord[]): string {
	const counts = new Map<string, number>();
	for (const r of list) counts.set(r.event, (counts.get(r.event) ?? 0) + 1);
	return USAGE_EVENTS.filter((e) => counts.has(e))
		.map((e) => `${e} ${counts.get(e)}`)
		.join(', ');
}

console.log(`Last ${days} day(s), UTC.\n`);
console.log(`Totals: ${countEvents(records) || 'nothing recorded'}`);

const byRecipe = new Map<string, ActivityRecord[]>();
for (const r of records) {
	if (!r.recipeId) continue;
	byRecipe.set(r.recipeId, [...(byRecipe.get(r.recipeId) ?? []), r]);
}
console.log('\nBy recipe:');
for (const [recipeId, list] of byRecipe) {
	console.log(`  ${await titleOf(recipeId)}: ${countEvents(list)}`);
}

const other = records.filter((r) => !r.recipeId);
if (other.length > 0) {
	console.log(`\nNot about one recipe: ${countEvents(other)}.`);
}
