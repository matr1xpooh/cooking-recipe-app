import type { Recipe } from '#lib/recipes/recipe.js';
import type { Language } from '#lib/recipes/languages.js';
import type { GlossaryRule } from '#lib/recipes/glossary.js';
import type { ImageType } from '#lib/recipes/screenshot.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { TranslationOverride } from './translation-override';
import type { TranslationCacheStore } from './translate';
import { createAwsStore } from './aws-store';

/**
 * Everything the server persists: recipes, their original images, hand-edited
 * translations, machine translations (cached) and each user's language. Routes depend
 * on this interface only.
 */
export interface RecipeStore extends TranslationCacheStore {
	listRecipes(): Promise<Recipe[]>;
	/** Adds the recipe at the top, or replaces the one with the same id in place. */
	saveRecipe(recipe: Recipe): Promise<void>;
	/** Removes the recipe and its images. Returns false when no such recipe exists. */
	deleteRecipe(id: string): Promise<boolean>;
	newImageId(): string;
	saveImage(recipeId: string, imageId: string, bytes: Uint8Array, type: ImageType): Promise<void>;
	readImage(
		recipeId: string,
		imageId: string
	): Promise<{ bytes: Uint8Array; type: ImageType } | null>;
	deleteImage(recipeId: string, imageId: string): Promise<void>;
	findRecipeByUrl(
		url: string,
		exceptId?: string,
		start?: number | null
	): Promise<Recipe | undefined>;
	findSameRecipe(recipe: Recipe): Promise<Recipe | undefined>;
	getOverride(recipeId: string, language: Language): Promise<TranslationOverride | undefined>;
	setOverride(recipeId: string, language: Language, override: TranslationOverride): Promise<void>;
	deleteOverride(recipeId: string, language: Language): Promise<void>;
	removeOverridesFor(recipeId: string): Promise<void>;
	/** Translation fixes, applied to machine translations for every recipe. */
	listGlossary(): Promise<GlossaryRule[]>;
	saveGlossaryRule(rule: GlossaryRule): Promise<void>;
	deleteGlossaryRule(id: string): Promise<boolean>;
	getUserLanguage(userSub: string): Promise<Language | undefined>;
	setUserLanguage(userSub: string, language: Language): Promise<void>;
}

let storeSingleton: RecipeStore | undefined;

/**
 * The app's store: recipes and edited translations in one DynamoDB table, original images in
 * a private S3 bucket. The table and bucket names come from the environment. Local runs and
 * tests point the AWS clients at emulators with AWS_ENDPOINT_URL_DYNAMODB and AWS_ENDPOINT_URL_S3.
 */
export function awsStore(): RecipeStore {
	if (!storeSingleton) {
		const table = process.env.TABLE_NAME;
		const bucket = process.env.BUCKET_NAME;
		if (!table || !bucket) throw new Error('TABLE_NAME and BUCKET_NAME must be set');
		// S3 emulators need path-style URLs, and they reject the newer checksum headers.
		const emulated = Boolean(process.env.AWS_ENDPOINT_URL_S3);
		storeSingleton = createAwsStore({
			table,
			bucket,
			dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
			s3: new S3Client(
				emulated ? { forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED' } : {}
			)
		});
	}
	return storeSingleton;
}

/** The store the routes use. */
export function getStore(): RecipeStore {
	return awsStore();
}
