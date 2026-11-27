import { describe, it, expect, afterEach } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
	createUsageSink,
	readActivity,
	recordUsage,
	setUsageSink,
	usageDay,
	type ActivityRecord
} from './usage';

interface Sent {
	input: {
		TableName?: string;
		Item?: ActivityRecord;
		ExclusiveStartKey?: unknown;
		ExpressionAttributeValues?: Record<string, string>;
	};
}

/** A fake client: stores puts, and answers queries from `items` by day. */
function fakeDynamo(items: Record<string, Partial<ActivityRecord>[]> = {}) {
	const sent: Sent[] = [];
	const send = async (command: Sent) => {
		sent.push(command);
		if (command.input.Item) return {};
		const day = command.input.ExpressionAttributeValues?.[':p']?.replace('ACTIVITY#', '') ?? '';
		return { Items: items[day] ?? [] };
	};
	return { sent, dynamo: { send } as unknown as DynamoDBDocumentClient };
}

const NOON = new Date('2026-11-27T12:00:00Z');

afterEach(() => setUsageSink(undefined));

describe('recording', () => {
	it('writes one record for the action, with who, which recipe and when', async () => {
		const fake = fakeDynamo();
		const sink = createUsageSink({ table: 'T', dynamo: fake.dynamo });
		await sink.record(
			'recipe.saved',
			{ sub: 'u1', email: 'ana@example.test' },
			{ recipeId: 'r1' },
			NOON
		);
		const item = fake.sent[0].input.Item!;
		expect(fake.sent[0].input.TableName).toBe('T');
		expect(item.pk).toBe('ACTIVITY#2026-11-27');
		expect(item.sk.startsWith('2026-11-27T12:00:00.000Z#')).toBe(true);
		expect(item).toMatchObject({
			event: 'recipe.saved',
			sub: 'u1',
			email: 'ana@example.test',
			recipeId: 'r1'
		});
	});

	it('sets the expiry about 13 months out', async () => {
		const fake = fakeDynamo();
		const sink = createUsageSink({ table: 'T', dynamo: fake.dynamo });
		await sink.record('signin', { sub: 'u1' }, {}, NOON);
		const days = (fake.sent[0].input.Item!.expireAt - NOON.getTime() / 1000) / 86400;
		expect(days).toBeGreaterThan(390);
		expect(days).toBeLessThan(410);
	});

	it('leaves the person out when there is no signed-in user', async () => {
		const fake = fakeDynamo();
		const sink = createUsageSink({ table: 'T', dynamo: fake.dynamo });
		await sink.record('import.failed', undefined, { reason: 'no_recipe_found' }, NOON);
		const item = fake.sent[0].input.Item!;
		expect(item).not.toHaveProperty('sub');
		expect(item).not.toHaveProperty('email');
		expect(item.reason).toBe('no_recipe_found');
	});

	it('uses the UTC day', () => {
		expect(usageDay(new Date('2026-11-27T23:30:00-05:00'))).toBe('2026-11-28');
	});

	it('never throws to the caller, even when the table fails', async () => {
		setUsageSink({
			record: async () => {
				throw new Error('table is down');
			}
		});
		await expect(
			recordUsage('photo.added', { sub: 'u1' }, { recipeId: 'r1' })
		).resolves.toBeUndefined();
	});
});

describe('reading', () => {
	it('returns the records of each day in the range', async () => {
		const fake = fakeDynamo({
			'2026-11-27': [{ event: 'recipe.saved', sub: 'u1', recipeId: 'r1' }],
			'2026-11-25': [{ event: 'signin', sub: 'u2' }]
		});
		const records = await readActivity({ table: 'T', dynamo: fake.dynamo }, 3, NOON);
		expect(records.map((r) => r.event)).toEqual(['recipe.saved', 'signin']);
		expect(records[0].recipeId).toBe('r1');
	});

	it('ignores records with an event it does not know', async () => {
		const fake = fakeDynamo({ '2026-11-27': [{ event: 'made.up' as never, sub: 'u1' }] });
		expect(await readActivity({ table: 'T', dynamo: fake.dynamo }, 1, NOON)).toEqual([]);
	});

	it('follows pages until there are no more', async () => {
		let calls = 0;
		const dynamo = {
			send: async () => {
				calls++;
				return calls === 1
					? { Items: [{ event: 'signin', sub: 'a' }], LastEvaluatedKey: { k: 1 } }
					: { Items: [{ event: 'signin', sub: 'b' }] };
			}
		} as unknown as DynamoDBDocumentClient;
		const records = await readActivity({ table: 'T', dynamo }, 1, NOON);
		expect(records.map((r) => r.sub)).toEqual(['a', 'b']);
	});
});
