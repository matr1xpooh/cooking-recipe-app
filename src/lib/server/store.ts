import type { Recipe } from '#lib/recipes/recipe.js';
import type { Language } from '#lib/recipes/languages.js';
import type { GlossaryRule } from '#lib/recipes/glossary.js';
import type { ImageType } from '#lib/recipes/screenshot.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import * as files from './recipe-data';
import * as overrides from './translation-overrides';
import * as glossary from './glossary-file';
import type { TranslationOverride } from './translation-overrides';
import * as state from './state-file';
import type { TranslationCacheStore } from './translate';
import { createAwsStore } from './aws-store';

/**
 * Everything the server persists: recipes, their original images, hand-edited
 * translations, machine translations (cached) and each user's language. Routes depend
 * on this interface only; `getStore()` picks the backend.
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

/** The local-disk backend, used in development. Data lives under RECIPE_DATA_DIR or ./data. */
export const fileStore: RecipeStore = {
	listRecipes: files.listRecipes,
	saveRecipe: files.saveRecipe,
	deleteRecipe: files.deleteRecipe,
	newImageId: files.newImageId,
	saveImage: files.saveImage,
	readImage: files.readImage,
	deleteImage: files.deleteImage,
	findRecipeByUrl: files.findRecipeByUrl,
	findSameRecipe: files.findSameRecipe,
	getOverride: overrides.getOverride,
	setOverride: overrides.setOverride,
	deleteOverride: overrides.deleteOverride,
	removeOverridesFor: overrides.removeOverridesFor,
	listGlossary: glossary.listGlossary,
	saveGlossaryRule: glossary.saveGlossaryRule,
	deleteGlossaryRule: glossary.deleteGlossaryRule,
	getCachedTranslation: state.getCachedTranslation,
	setCachedTranslation: state.setCachedTranslation,
	getUserLanguage: state.getUserLanguage,
	setUserLanguage: state.setUserLanguage
};

let awsSingleton: RecipeStore | undefined;

/** The deployed store. Its table and bucket names come from the environment set by the SST config. */
export function awsStore(): RecipeStore {
	if (!awsSingleton) {
		const table = process.env.TABLE_NAME;
		const bucket = process.env.BUCKET_NAME;
		if (!table || !bucket) throw new Error('TABLE_NAME and BUCKET_NAME must be set for STORE=aws');
		awsSingleton = createAwsStore({
			table,
			bucket,
			dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({})),
			s3: new S3Client({})
		});
	}
	return awsSingleton;
}

/**
 * Set by vite.config.ts when the app is built (STORE=aws or STORE=file). The branch that is not
 * taken is removed from the build, so a deployed app contains no local-file code path.
 */
declare const __RECIPE_STORE__: 'file' | 'aws';

/** The store this build uses. Routes call this; they do not choose a backend themselves. */
export function getStore(): RecipeStore {
	return __RECIPE_STORE__ === 'aws' ? awsStore() : fileStore;
}
