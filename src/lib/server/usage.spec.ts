import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, it, expect } from 'vitest';
import { createUsageSink, readUsage, totalUsage, usageDay, usageKey } from './usage';

type Input = {
	Key?: { pk: string; sk: string };
	UpdateExpression?: string;
	ExpressionAttributeValues: Record<string, string | number>;
};

function fakeDynamo(items: Record<string, Record<string, unknown>[]> = {}) {
	const sent: { input: Input }[] = [];
	const send = async (command: { input: Input }) => {
		sent.push(command);
		if (command.input.UpdateExpression) return {};
		const day = String(command.input.ExpressionAttributeValues[':p']).replace('USAGE#', '');
		return { Items: items[day] ?? [] };
	};
	return { sent, dynamo: { send } as unknown as DynamoDBDocumentClient };
}

const NOON = new Date('2026-11-27T12:00:00Z');

describe('recording', () => {
	it("adds one to today's count for the event, and sets the expiry about 13 months out", async () => {
		const fake = fakeDynamo();
		const sink = createUsageSink({ table: 'T', dynamo: fake.dynamo });
		await sink.record('recipe.created', NOON);
		const input = fake.sent[0].input;
		expect(input.Key).toEqual({ pk: 'USAGE#2026-11-27', sk: 'EVENT#recipe.created' });
		expect(input.UpdateExpression).toBe('ADD #count :one SET #expireAt = :expireAt');
		expect(input.ExpressionAttributeValues[':one']).toBe(1);
		const days =
			(Number(input.ExpressionAttributeValues[':expireAt']) - NOON.getTime() / 1000) / 86400;
		expect(days).toBeGreaterThan(390);
		expect(days).toBeLessThan(410);
	});

	it('uses the UTC day', () => {
		expect(usageDay(new Date('2026-11-27T23:30:00-05:00'))).toBe('2026-11-28');
	});

	it('keys carry no person, only the day and the event', () => {
		expect(usageKey('2026-11-27', 'signin')).toEqual({
			pk: 'USAGE#2026-11-27',
			sk: 'EVENT#signin'
		});
	});
});

describe('reading', () => {
	it('returns each of the last days, today first, with the counts it found', async () => {
		const fake = fakeDynamo({
			'2026-11-27': [
				{ sk: 'EVENT#recipe.created', count: 3 },
				{ sk: 'EVENT#signin', count: 2 }
			],
			'2026-11-25': [{ sk: 'EVENT#import.failed', count: 1 }]
		});
		const rows = await readUsage({ table: 'T', dynamo: fake.dynamo }, 3, NOON);
		expect(rows.map((r) => r.day)).toEqual(['2026-11-27', '2026-11-26', '2026-11-25']);
		expect(rows[0].counts).toEqual({ 'recipe.created': 3, signin: 2 });
		expect(rows[2].counts).toEqual({ 'import.failed': 1 });
	});

	it('ignores items that are not known events', async () => {
		const fake = fakeDynamo({ '2026-11-27': [{ sk: 'EVENT#made.up', count: 9 }] });
		const rows = await readUsage({ table: 'T', dynamo: fake.dynamo }, 1, NOON);
		expect(rows[0].counts).toEqual({});
	});

	it('adds the days up per event', () => {
		const totals = totalUsage([
			{ day: 'a', counts: { signin: 2, 'recipe.created': 1 } },
			{ day: 'b', counts: { signin: 5 } }
		]);
		expect(totals.signin).toBe(7);
		expect(totals['recipe.created']).toBe(1);
		expect(totals['photo.added']).toBe(0);
	});
});
