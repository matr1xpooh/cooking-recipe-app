import {
	DeleteCommand,
	GetCommand,
	PutCommand,
	QueryCommand,
	type DynamoDBDocumentClient
} from '@aws-sdk/lib-dynamodb';
import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	type S3Client
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type { Recipe } from '#lib/recipes/recipe.js';
import type { Language } from '#lib/recipes/languages.js';
import { isRecipe, normalizeRecipe } from '#lib/recipes/validate.js';
import { sniffImageType, type ImageType } from '#lib/recipes/screenshot.js';
import type { RecipeStore } from './store';
import type { TranslationOverride } from './translation-overrides';
import { matchByUrl, matchSame } from './recipe-match';

/**
 * The deployed store: recipes and edited translations in one DynamoDB table, original
 * images in a private S3 bucket. Item layout (pk / sk):
 *   RECIPE#<id>  / META        recipe JSON in `data`; gsi1pk = RECIPES, gsi1sk = createdAt
 *   RECIPE#<id>  / TRANS#<lang> edited translation JSON in `data`
 * Images: <recipe id>/<image id>.png or .jpg in the bucket.
 * Written against the AWS SDK clients passed in, so tests can use a fake.
 */

export interface AwsStoreConfig {
	table: string;
	bucket: string;
	dynamo: DynamoDBDocumentClient;
	s3: S3Client;
}

const IMAGE_EXTENSIONS: Record<ImageType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
const RECIPES_PARTITION = 'RECIPES';
const RECIPES_INDEX = 'gsi1';

const recipeKey = (id: string) => ({ pk: `RECIPE#${id}`, sk: 'META' });
const translationKey = (id: string, language: Language) => ({
	pk: `RECIPE#${id}`,
	sk: `TRANS#${language}`
});

/** A stored recipe, or null when the item is not a recipe. Corrupt items are skipped. */
function parseRecipe(raw: unknown): Recipe | null {
	if (typeof raw !== 'string') return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return isRecipe(parsed) ? normalizeRecipe(parsed) : null;
	} catch {
		return null;
	}
}

function isMissing(error: unknown): boolean {
	return (error as { name?: string })?.name === 'NoSuchKey';
}

export function createAwsStore(config: AwsStoreConfig): RecipeStore {
	const { table, bucket, dynamo, s3 } = config;

	async function listRecipes(): Promise<Recipe[]> {
		const recipes: Recipe[] = [];
		let startKey: Record<string, unknown> | undefined;
		do {
			const page = await dynamo.send(
				new QueryCommand({
					TableName: table,
					IndexName: RECIPES_INDEX,
					KeyConditionExpression: 'gsi1pk = :p',
					ExpressionAttributeValues: { ':p': RECIPES_PARTITION },
					ScanIndexForward: false,
					ExclusiveStartKey: startKey
				})
			);
			for (const item of page.Items ?? []) {
				const recipe = parseRecipe(item.data);
				if (recipe) recipes.push(recipe);
			}
			startKey = page.LastEvaluatedKey;
		} while (startKey);
		return recipes;
	}

	/** Deletes every object under a prefix. Missing prefixes are fine. */
	async function deletePrefix(prefix: string): Promise<void> {
		let token: string | undefined;
		do {
			const page = await s3.send(
				new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
			);
			const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
			if (keys.length > 0) {
				await s3.send(
					new DeleteObjectsCommand({
						Bucket: bucket,
						Delete: { Objects: keys.map((Key) => ({ Key })) }
					})
				);
			}
			token = page.IsTruncated ? page.NextContinuationToken : undefined;
		} while (token);
	}

	return {
		listRecipes,

		async saveRecipe(recipe) {
			const next = normalizeRecipe(recipe);
			await dynamo.send(
				new PutCommand({
					TableName: table,
					Item: {
						...recipeKey(next.id),
						gsi1pk: RECIPES_PARTITION,
						gsi1sk: next.createdAt,
						data: JSON.stringify(next)
					}
				})
			);
		},

		async deleteRecipe(id) {
			const existing = await dynamo.send(new GetCommand({ TableName: table, Key: recipeKey(id) }));
			if (!existing.Item) return false;
			await dynamo.send(new DeleteCommand({ TableName: table, Key: recipeKey(id) }));
			await deletePrefix(`${id}/`);
			return true;
		},

		newImageId: () => randomUUID(),

		async saveImage(recipeId, imageId, bytes, type) {
			await s3.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: `${recipeId}/${imageId}.${IMAGE_EXTENSIONS[type]}`,
					Body: bytes,
					ContentType: type
				})
			);
		},

		async readImage(recipeId, imageId) {
			for (const [type, ext] of Object.entries(IMAGE_EXTENSIONS) as [ImageType, string][]) {
				let body: Uint8Array;
				try {
					const res = await s3.send(
						new GetObjectCommand({ Bucket: bucket, Key: `${recipeId}/${imageId}.${ext}` })
					);
					if (!res.Body) continue;
					body = await res.Body.transformToByteArray();
				} catch (error) {
					if (isMissing(error)) continue;
					throw error;
				}
				return sniffImageType(body) === type ? { bytes: body, type } : null;
			}
			return null;
		},

		async deleteImage(recipeId, imageId) {
			for (const ext of Object.values(IMAGE_EXTENSIONS)) {
				await s3.send(
					new DeleteObjectCommand({ Bucket: bucket, Key: `${recipeId}/${imageId}.${ext}` })
				);
			}
		},

		async findRecipeByUrl(url, exceptId, start) {
			return matchByUrl(await listRecipes(), url, exceptId, start);
		},

		async findSameRecipe(recipe) {
			return matchSame(await listRecipes(), recipe);
		},

		async getOverride(recipeId, language) {
			const res = await dynamo.send(
				new GetCommand({ TableName: table, Key: translationKey(recipeId, language) })
			);
			if (typeof res.Item?.data !== 'string') return undefined;
			return JSON.parse(res.Item.data) as TranslationOverride;
		},

		async setOverride(recipeId, language, override) {
			await dynamo.send(
				new PutCommand({
					TableName: table,
					Item: { ...translationKey(recipeId, language), data: JSON.stringify(override) }
				})
			);
		},

		async deleteOverride(recipeId, language) {
			await dynamo.send(
				new DeleteCommand({ TableName: table, Key: translationKey(recipeId, language) })
			);
		},

		async removeOverridesFor(recipeId) {
			let startKey: Record<string, unknown> | undefined;
			do {
				const page = await dynamo.send(
					new QueryCommand({
						TableName: table,
						KeyConditionExpression: 'pk = :p AND begins_with(sk, :t)',
						ExpressionAttributeValues: { ':p': `RECIPE#${recipeId}`, ':t': 'TRANS#' },
						ExclusiveStartKey: startKey
					})
				);
				for (const item of page.Items ?? []) {
					await dynamo.send(
						new DeleteCommand({ TableName: table, Key: { pk: item.pk, sk: item.sk } })
					);
				}
				startKey = page.LastEvaluatedKey;
			} while (startKey);
		}
	};
}
