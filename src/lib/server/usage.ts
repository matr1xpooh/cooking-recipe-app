/**
 * Daily counts of what people do in the app. One DynamoDB item per day and event, holding a
 * number. Nothing identifies a person and no recipe content is stored. Items expire after
 * about 13 months (the table's TTL attribute, `expireAt`). Counting never fails a request.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export const USAGE_EVENTS = [
	'recipe.created',
	'recipe.deleted',
	'photo.added',
	'translation.shown',
	'translation.failed',
	'import.failed',
	'signin'
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

const RETENTION_SECONDS = 400 * 24 * 60 * 60;

/** The UTC day a count belongs to, as YYYY-MM-DD. */
export function usageDay(now: Date): string {
	return now.toISOString().slice(0, 10);
}

export const usageKey = (day: string, event: UsageEvent) => ({
	pk: `USAGE#${day}`,
	sk: `EVENT#${event}`
});

export interface UsageSink {
	record(event: UsageEvent, now?: Date): Promise<void>;
}

export function createUsageSink(config: {
	table: string;
	dynamo: DynamoDBDocumentClient;
}): UsageSink {
	const { table, dynamo } = config;
	return {
		async record(event, now = new Date()) {
			const expireAt = Math.floor(now.getTime() / 1000) + RETENTION_SECONDS;
			await dynamo.send(
				new UpdateCommand({
					TableName: table,
					Key: usageKey(usageDay(now), event),
					UpdateExpression: 'ADD #count :one SET #expireAt = :expireAt',
					ExpressionAttributeNames: { '#count': 'count', '#expireAt': 'expireAt' },
					ExpressionAttributeValues: { ':one': 1, ':expireAt': expireAt }
				})
			);
		}
	};
}

export type DailyCounts = { day: string; counts: Partial<Record<UsageEvent, number>> };

/** The counts for each of the last `days` UTC days, today first. */
export async function readUsage(
	config: { table: string; dynamo: DynamoDBDocumentClient },
	days: number,
	now = new Date()
): Promise<DailyCounts[]> {
	const result: DailyCounts[] = [];
	for (let back = 0; back < days; back++) {
		const day = usageDay(new Date(now.getTime() - back * 24 * 60 * 60 * 1000));
		const page = await config.dynamo.send(
			new QueryCommand({
				TableName: config.table,
				KeyConditionExpression: 'pk = :p',
				ExpressionAttributeValues: { ':p': `USAGE#${day}` }
			})
		);
		const counts: Partial<Record<UsageEvent, number>> = {};
		for (const item of page.Items ?? []) {
			const event = String(item.sk).replace(/^EVENT#/, '') as UsageEvent;
			if (USAGE_EVENTS.includes(event)) counts[event] = Number(item.count ?? 0);
		}
		result.push({ day, counts });
	}
	return result;
}

/** Adds up the daily counts, one total per event. */
export function totalUsage(rows: DailyCounts[]): Record<UsageEvent, number> {
	const totals = Object.fromEntries(USAGE_EVENTS.map((e) => [e, 0])) as Record<UsageEvent, number>;
	for (const row of rows) {
		for (const event of USAGE_EVENTS) totals[event] += row.counts[event] ?? 0;
	}
	return totals;
}

let sinkSingleton: UsageSink | undefined;

/**
 * Counts one event. Errors are swallowed: a missing count must never break the request that
 * caused it. Tests pass a fake sink through setUsageSink.
 */
export async function recordUsage(event: UsageEvent): Promise<void> {
	try {
		sinkSingleton ??= defaultSink();
		await sinkSingleton.record(event);
	} catch {
		// Deliberately silent.
	}
}

/** Replaces the sink (tests only). Pass undefined to go back to the table. */
export function setUsageSink(sink: UsageSink | undefined): void {
	sinkSingleton = sink;
}

function defaultSink(): UsageSink {
	const table = process.env.TABLE_NAME;
	if (!table) throw new Error('TABLE_NAME must be set');
	return createUsageSink({ table, dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})) });
}
