/**
 * Prints how the app was used over the last few days: counts per event per day, and totals.
 * Counts only; nothing identifies a person.
 *
 *   npx sst shell --stage production -- tsx scripts/usage-summary.ts [days]
 *
 * days defaults to 7. Run through `sst shell`, so Resource.Table is set.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Resource } from 'sst';
import { USAGE_EVENTS, readUsage, totalUsage } from '../src/lib/server/usage.ts';

const days = Number(process.argv[2] ?? 7);
if (!Number.isInteger(days) || days < 1 || days > 400) {
	throw new Error('days must be a whole number from 1 to 400');
}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-west-1' }));
const rows = await readUsage({ table: Resource.Table.name, dynamo }, days);
const totals = totalUsage(rows);

console.log(`Last ${days} day(s), UTC. Counts only.\n`);
console.log(['event'.padEnd(18), 'total', ...rows.map((r) => r.day.slice(5))].join('  '));
for (const event of USAGE_EVENTS) {
	const cells = rows.map((r) => String(r.counts[event] ?? 0).padStart(5));
	console.log(
		[event.padEnd(18), String(totals[event]).padStart(5), ...cells.map((c) => c.padStart(5))].join(
			'  '
		)
	);
}
