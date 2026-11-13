import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Recipe } from '#lib/recipes/recipe.js';
import { isLanguage, type Language } from '#lib/recipes/languages.js';
import { sniffImageType, type ImageType } from '#lib/recipes/screenshot.js';
import { isTranslatedFields } from '#lib/recipes/translation-fields.js';
import { isRecipe, normalizeRecipe } from '#lib/recipes/validate.js';
import { isSafeId } from './recipe-data';
import type { RecipeStore } from './store';
import type { TranslationOverride } from './translation-overrides';

/**
 * Copies the local data folder into a RecipeStore (the AWS one in practice). Reading is
 * separate from writing, so a dry run can show exactly what would be copied. Writing
 * uses the store's own puts, so running it again only rewrites the same items.
 *
 * Reads, from the data folder:
 *   recipes.json        the recipe list
 *   translations.json   hand-edited translations: recipe id -> language -> override
 *   images/<id>/<image id>.png|jpg   the original photos
 *   images/<id>.png|jpg              the one photo kept before there were several
 *                                    (listed in the recipe as "legacy")
 */

const EXTENSIONS: Record<ImageType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
const LEGACY_IMAGE = 'legacy';

export interface PlannedImage {
	recipeId: string;
	imageId: string;
	bytes: Uint8Array;
	type: ImageType;
}

export interface PlannedOverride {
	recipeId: string;
	language: Language;
	override: TranslationOverride;
}

export interface MigrationPlan {
	recipes: Recipe[];
	images: PlannedImage[];
	overrides: PlannedOverride[];
	/** Things left out or missing, for the report. Nothing here stops the migration. */
	problems: string[];
}

async function readIfExists(file: string): Promise<Uint8Array | null> {
	try {
		return new Uint8Array(await readFile(file));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw error;
	}
}

async function readJsonIfExists(file: string): Promise<unknown> {
	const bytes = await readIfExists(file);
	if (bytes === null) return undefined;
	try {
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new Error(`${file} is not valid JSON; fix or move it before migrating`);
	}
}

/** Finds and reads one original photo, trying each place it could be. */
async function findImage(
	dataDir: string,
	recipe: Recipe,
	imageId: string
): Promise<{ bytes: Uint8Array; type: ImageType } | null> {
	const candidates: string[] = [];
	for (const ext of Object.values(EXTENSIONS)) {
		candidates.push(path.join(dataDir, 'images', recipe.id, `${imageId}.${ext}`));
		if (imageId === LEGACY_IMAGE)
			candidates.push(path.join(dataDir, 'images', `${recipe.id}.${ext}`));
	}
	for (const file of candidates) {
		const bytes = await readIfExists(file);
		if (bytes === null) continue;
		const type = sniffImageType(bytes);
		if (type) return { bytes, type };
	}
	return null;
}

/** Reads the data folder and says what would be copied. Writes nothing. */
export async function planMigration(dataDir: string): Promise<MigrationPlan> {
	const problems: string[] = [];

	const rawRecipes = await readJsonIfExists(path.join(dataDir, 'recipes.json'));
	const recipes: Recipe[] = [];
	if (rawRecipes !== undefined) {
		if (!Array.isArray(rawRecipes)) throw new Error('recipes.json must hold a list of recipes');
		for (const item of rawRecipes) {
			if (!isRecipe(item) || !isSafeId(item.id)) {
				problems.push(
					`skipped a recipe that is not valid${isRecipe(item) ? ` (id ${item.id})` : ''}`
				);
				continue;
			}
			recipes.push(normalizeRecipe(item));
		}
	}
	const ids = new Set(recipes.map((r) => r.id));

	const images: PlannedImage[] = [];
	for (const recipe of recipes) {
		for (const imageId of recipe.images) {
			const found = await findImage(dataDir, recipe, imageId);
			if (!found) {
				problems.push(`missing or unreadable photo ${recipe.id}/${imageId}`);
				continue;
			}
			images.push({ recipeId: recipe.id, imageId, ...found });
		}
	}

	const overrides: PlannedOverride[] = [];
	const rawOverrides = await readJsonIfExists(path.join(dataDir, 'translations.json'));
	if (rawOverrides !== undefined) {
		if (typeof rawOverrides !== 'object' || rawOverrides === null || Array.isArray(rawOverrides)) {
			throw new Error('translations.json must be an object keyed by recipe id');
		}
		for (const [recipeId, byLanguage] of Object.entries(rawOverrides)) {
			if (!ids.has(recipeId)) {
				problems.push(`skipped edited translations of unknown recipe ${recipeId}`);
				continue;
			}
			for (const [language, value] of Object.entries(byLanguage ?? {}) as [string, unknown][]) {
				const override = value as { hash?: unknown; fields?: unknown } | null;
				if (
					!isLanguage(language) ||
					typeof override?.hash !== 'string' ||
					!isTranslatedFields(override.fields)
				) {
					problems.push(`skipped a bad edited translation ${recipeId}/${language}`);
					continue;
				}
				overrides.push({
					recipeId,
					language,
					override: { hash: override.hash, fields: override.fields }
				});
			}
		}
	}

	return { recipes, images, overrides, problems };
}

/** Writes the plan into the store. Recipes go first so photos and edits always have one. */
export async function applyMigration(
	plan: MigrationPlan,
	store: Pick<RecipeStore, 'saveRecipe' | 'saveImage' | 'setOverride'>
): Promise<void> {
	for (const recipe of plan.recipes) await store.saveRecipe(recipe);
	for (const image of plan.images) {
		await store.saveImage(image.recipeId, image.imageId, image.bytes, image.type);
	}
	for (const { recipeId, language, override } of plan.overrides) {
		await store.setOverride(recipeId, language, override);
	}
}
