import type { Recipe } from './recipe';

export const RECIPES_STORAGE_KEY = 'recipes.v1';

/** The subset of the Web Storage API the store needs. */
export interface KeyValueStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

function isRecipe(value: unknown): value is Recipe {
	if (typeof value !== 'object' || value === null) return false;
	const r = value as Record<string, unknown>;
	return (
		typeof r.id === 'string' &&
		typeof r.title === 'string' &&
		(r.sourceUrl === null || typeof r.sourceUrl === 'string') &&
		Array.isArray(r.ingredients) &&
		r.ingredients.every((i) => typeof i === 'string') &&
		Array.isArray(r.steps) &&
		r.steps.every((s) => typeof s === 'string') &&
		typeof r.createdAt === 'string' &&
		typeof r.archived === 'boolean' &&
		(r.notes === undefined || typeof r.notes === 'string')
	);
}

/** Reads recipes from storage. Corrupt or missing data yields an empty list. */
export function readRecipes(storage: KeyValueStorage): Recipe[] {
	const raw = storage.getItem(RECIPES_STORAGE_KEY);
	if (raw === null) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		// Copy only known fields: drops stale keys from older versions. Recipes saved
		// before notes existed get empty notes instead of being dropped.
		return parsed.filter(isRecipe).map((r) => ({
			id: r.id,
			title: r.title,
			sourceUrl: r.sourceUrl,
			ingredients: r.ingredients,
			steps: r.steps,
			notes: r.notes ?? '',
			createdAt: r.createdAt,
			archived: r.archived
		}));
	} catch {
		return [];
	}
}

export class RecipeStore {
	recipes = $state<Recipe[]>([]);
	private storage: KeyValueStorage | null;

	constructor(storage: KeyValueStorage | null) {
		this.storage = storage;
	}

	/** Loads persisted recipes. Call on the client only; a no-op without storage. */
	load(): void {
		if (!this.storage) return;
		this.recipes = readRecipes(this.storage);
	}

	/** Adds a recipe to the top of the list and persists the list. */
	add(recipe: Recipe): void {
		this.recipes = [recipe, ...this.recipes];
		this.persist();
	}

	private persist(): void {
		this.storage?.setItem(RECIPES_STORAGE_KEY, JSON.stringify(this.recipes));
	}
}

export const recipeStore = new RecipeStore(
	typeof localStorage === 'undefined' ? null : localStorage
);
