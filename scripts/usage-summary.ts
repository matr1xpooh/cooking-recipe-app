/**
 * Who did what, over the last few days: counts per member and per recipe. Visible to the owner
 * only; it prints email addresses.
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

/** Each recipe's current title, read from the recipe itself. */
async function titleOf(recipeId: string): Promise<string> {
	const item = await dynamo.send(
		new GetCommand({ TableName: table, Key: { pk: `RECIPE#${recipeId}`, sk: 'META' } })
	);
	if (!item.Item) return '(deleted)';
	const data = typeof item.Item.data === 'string' ? JSON.parse(item.Item.data) : item.Item.data;
	return String(data?.title ?? '(untitled)');
}

function countBy(list: ActivityRecord[], key: (r: ActivityRecord) => string | undefined) {
	const out = new Map<string, Map<string, number>>();
	for (const r of list) {
		const k = key(r);
		if (k === undefined) continue;
		const row = out.get(k) ?? new Map<string, number>();
		row.set(r.event, (row.get(r.event) ?? 0) + 1);
		out.set(k, row);
	}
	return out;
}

const who = (r: ActivityRecord) => r.email ?? (r.sub ? `(${r.sub.slice(0, 8)})` : undefined);

console.log(`Last ${days} day(s), UTC.\n`);

console.log('By member:');
for (const [member, row] of countBy(records, who)) {
	const parts = USAGE_EVENTS.filter((e) => row.has(e)).map((e) => `${e} ${row.get(e)}`);
	console.log(`  ${member}: ${parts.join(', ')}`);
}

console.log('\nBy recipe (who did what):');
const byRecipe = new Map<string, ActivityRecord[]>();
for (const r of records) {
	if (!r.recipeId) continue;
	byRecipe.set(r.recipeId, [...(byRecipe.get(r.recipeId) ?? []), r]);
}
for (const [recipeId, list] of byRecipe) {
	console.log(`  ${await titleOf(recipeId)}`);
	for (const [member, row] of countBy(list, who)) {
		const parts = USAGE_EVENTS.filter((e) => row.has(e)).map((e) => `${e} ${row.get(e)}`);
		console.log(`    ${member}: ${parts.join(', ')}`);
	}
}

const other = records.filter((r) => !r.recipeId);
if (other.length > 0) {
	console.log(`\nNot about one recipe: ${other.length} (sign-ins, translations, failed imports).`);
}
