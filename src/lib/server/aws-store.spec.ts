import { describe, it, expect } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
	DeleteCommand,
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	QueryCommand
} from '@aws-sdk/lib-dynamodb';
import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import { createAwsStore } from './aws-store';
import { describeStoreContract } from './store-contract';

/**
 * The AWS store against an in-memory stand-in for DynamoDB and S3. The stand-in answers
 * only the calls aws-store makes, so these tests check the store's logic and key layout;
 * they do not prove AWS itself behaves the same. The deployed table is checked after deploy.
 */

type Item = Record<string, unknown>;
type Key = { pk: unknown; sk: unknown };

/** A fresh store wired to fresh in-memory tables and buckets. */
function makeStore() {
	const items = new Map<string, Item>();
	const objects = new Map<string, Uint8Array>();
	const itemKey = (key: Key) => `${key.pk}|${key.sk}`;

	const dynamo = mockClient(DynamoDBDocumentClient);
	dynamo.reset();
	dynamo.on(PutCommand).callsFake((input) => {
		const item = input.Item as Item;
		items.set(itemKey(item as unknown as Key), { ...item });
		return {};
	});
	dynamo.on(GetCommand).callsFake((input) => {
		const item = items.get(itemKey(input.Key as unknown as Key));
		return { Item: item ? { ...item } : undefined };
	});
	dynamo.on(DeleteCommand).callsFake((input) => {
		items.delete(itemKey(input.Key as unknown as Key));
		return {};
	});
	dynamo.on(QueryCommand).callsFake((input) => {
		const values = input.ExpressionAttributeValues ?? {};
		let found = [...items.values()];
		if (input.IndexName === 'gsi1') {
			found = found.filter((i) => i.gsi1pk === values[':p']);
			found.sort((a, b) => String(b.gsi1sk).localeCompare(String(a.gsi1sk)));
		} else {
			found = found.filter(
				(i) =>
					i.pk === values[':p'] &&
					(values[':t'] === undefined || String(i.sk).startsWith(String(values[':t'])))
			);
		}
		return { Items: found.map((i) => ({ ...i })) };
	});

	const s3 = mockClient(S3Client);
	s3.reset();
	s3.on(PutObjectCommand).callsFake((input) => {
		objects.set(String(input.Key), new Uint8Array(input.Body as Uint8Array));
		return {};
	});
	s3.on(GetObjectCommand).callsFake((input) => {
		const bytes = objects.get(String(input.Key));
		if (!bytes) {
			const error = new Error('The specified key does not exist.');
			error.name = 'NoSuchKey';
			throw error;
		}
		return { Body: { transformToByteArray: async () => bytes } };
	});
	s3.on(DeleteObjectCommand).callsFake((input) => {
		objects.delete(String(input.Key));
		return {};
	});
	s3.on(ListObjectsV2Command).callsFake((input) => {
		const keys = [...objects.keys()].filter((k) => k.startsWith(String(input.Prefix ?? '')));
		return { Contents: keys.map((Key) => ({ Key })), IsTruncated: false };
	});
	s3.on(DeleteObjectsCommand).callsFake((input) => {
		for (const o of input.Delete?.Objects ?? []) objects.delete(String(o.Key));
		return {};
	});

	const store = createAwsStore({
		table: 'test-table',
		bucket: 'test-bucket',
		dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-west-1' })),
		s3: new S3Client({ region: 'eu-west-1' })
	});
	return { store, items, objects };
}

describeStoreContract('AWS store', async () => {
	const { store, items, objects } = makeStore();
	return {
		store,
		cleanup: async () => {
			items.clear();
			objects.clear();
		}
	};
});

describe('AWS store layout', () => {
	it('stores a recipe under its own partition, in the newest-first index', async () => {
		const { store, items } = makeStore();
		await store.saveRecipe({
			id: 'r-1',
			title: 'Soup',
			sourceUrl: null,
			sourceStart: null,
			ingredients: [],
			steps: [],
			notes: '',
			images: [],
			source: 'typed',
			tags: [],
			createdAt: '2026-11-07T10:00:00.000Z',
			archived: false
		});
		const item = items.get('RECIPE#r-1|META');
		expect(item).toBeDefined();
		expect(item?.gsi1pk).toBe('RECIPES');
		expect(item?.gsi1sk).toBe('2026-11-07T10:00:00.000Z');
	});

	it('keeps images under the recipe id prefix so one prefix removes them all', async () => {
		const { store, objects } = makeStore();
		await store.saveRecipe({
			id: 'r-2',
			title: 'Rice',
			sourceUrl: null,
			sourceStart: null,
			ingredients: [],
			steps: [],
			notes: '',
			images: [],
			source: 'typed',
			tags: [],
			createdAt: '2026-11-07T10:00:00.000Z',
			archived: false
		});
		await store.saveImage('r-2', 'img-1', new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png');
		expect([...objects.keys()]).toEqual(['r-2/img-1.png']);
		await store.deleteRecipe('r-2');
		expect([...objects.keys()]).toEqual([]);
	});
});
