/**
 * What people do in the app, one record per action: who did it, which recipe it was for, and
 * when. Records live in the app's DynamoDB table under ACTIVITY#<day> and expire after about
 * 13 months (TTL on expireAt). The summary script reads them; no recipe content is stored.
 * Recording never fails a request.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

export const USAGE_EVENTS = [
	'recipe.saved',
	'recipe.deleted',
	'photo.added',
	'translation.shown',
	'translation.failed',
	'import.failed',
	'signin'
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

/** Who did it. The email is what the owner sees in the summary. */
export interface Actor {
	sub: string;
	email?: string;
}

export interface UsageDetails {
	recipeId?: string;
	language?: string;
	reason?: string;
}

export interface ActivityRecord extends UsageDetails {
	pk: string;
	sk: string;
	event: UsageEvent;
	at: string;
	sub?: string;
	email?: string;
	expireAt: number;
}

const RETENTION_SECONDS = 400 * 24 * 60 * 60;

/** The UTC day a record belongs to, as YYYY-MM-DD. */
export function usageDay(now: Date): string {
	return now.toISOString().slice(0, 10);
}

export interface UsageSink {
	record(event: UsageEvent, actor?: Actor, details?: UsageDetails, now?: Date): Promise<void>;
}

export function createUsageSink(config: {
	table: string;
	dynamo: DynamoDBDocumentClient;
}): UsageSink {
	const { table, dynamo } = config;
	return {
		async record(event, actor, details = {}, now = new Date()) {
			const item: ActivityRecord = {
				pk: `ACTIVITY#${usageDay(now)}`,
				// Sorts by time; the random part keeps two actions in the same instant apart.
				sk: `${now.toISOString()}#${crypto.randomUUID()}`,
				event,
				at: now.toISOString(),
				...(actor ? { sub: actor.sub, ...(actor.email ? { email: actor.email } : {}) } : {}),
				...details,
				expireAt: Math.floor(now.getTime() / 1000) + RETENTION_SECONDS
			};
			await dynamo.send(new PutCommand({ TableName: table, Item: item }));
		}
	};
}

let sinkSingleton: UsageSink | undefined;

/**
 * Records one action. Errors are swallowed: a missing record must never break the request that
 * caused it. Tests pass a fake sink through setUsageSink.
 */
export async function recordUsage(
	event: UsageEvent,
	actor?: Actor,
	details?: UsageDetails
): Promise<void> {
	try {
		sinkSingleton ??= defaultSink();
		await sinkSingleton.record(event, actor, details);
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

/** The records of the last `days` UTC days, newest day first. */
export async function readActivity(
	config: { table: string; dynamo: DynamoDBDocumentClient },
	days: number,
	now = new Date()
): Promise<ActivityRecord[]> {
	const records: ActivityRecord[] = [];
	for (let back = 0; back < days; back++) {
		const day = usageDay(new Date(now.getTime() - back * 24 * 60 * 60 * 1000));
		let startKey: Record<string, unknown> | undefined;
		do {
			const page = await config.dynamo.send(
				new QueryCommand({
					TableName: config.table,
					KeyConditionExpression: 'pk = :p',
					ExpressionAttributeValues: { ':p': `ACTIVITY#${day}` },
					ExclusiveStartKey: startKey
				})
			);
			for (const item of page.Items ?? []) {
				if (USAGE_EVENTS.includes(item.event as UsageEvent)) {
					records.push(item as ActivityRecord);
				}
			}
			startKey = page.LastEvaluatedKey;
		} while (startKey);
	}
	return records;
}
