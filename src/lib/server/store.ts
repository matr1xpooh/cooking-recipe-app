import type { Recipe } from '#lib/recipes/recipe.js';
import type { Language } from '#lib/recipes/languages.js';
import type { ImageType } from '#lib/recipes/screenshot.js';
import * as files from './recipe-data';
import * as overrides from './translation-overrides';
import type { TranslationOverride } from './translation-overrides';

/**
 * Everything the server persists: recipes, their original images, and hand-edited
 * translations. Routes depend on this interface only; `getStore()` picks the backend.
 */
export interface RecipeStore {
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
}

/** The local-disk backend, used in development. Data lives under RECIPE_DATA_DIR or ./data. */
const fileStore: RecipeStore = {
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
	removeOverridesFor: overrides.removeOverridesFor
};

/** The store selected by the STORE environment variable. Defaults to the file store. */
export function getStore(): RecipeStore {
	const kind = process.env.STORE ?? 'file';
	if (kind === 'file') return fileStore;
	throw new Error(`Unknown STORE "${kind}"`);
}
