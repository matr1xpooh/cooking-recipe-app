import type { Recipe } from './recipe';
import { fetchRecipes, postRecipe } from './recipe-api';
import { migrateLegacyRecipes } from './legacy-local';

/** The subset of the Web Storage API the translation cache uses. */
export interface KeyValueStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** The server calls the store needs. Injected so the store can be tested without a server. */
export interface RecipeApi {
	list(): Promise<Recipe[]>;
	save(recipe: Recipe): Promise<void>;
	migrate(): Promise<void>;
}

const serverApi: RecipeApi = {
	list: fetchRecipes,
	save: postRecipe,
	migrate: migrateLegacyRecipes
};

/**
 * The recipe list, kept on the server. Changes show at once and are reverted if the
 * server refuses them, in which case the error is thrown for the page to show.
 */
export class RecipeStore {
	recipes = $state<Recipe[]>([]);
	loadError = $state<string | null>(null);
	private api: RecipeApi;

	constructor(api: RecipeApi) {
		this.api = api;
	}

	/** Loads the recipes from the server, moving browser-held ones over first. */
	async load(): Promise<void> {
		try {
			await this.api.migrate();
			this.recipes = await this.api.list();
			this.loadError = null;
		} catch {
			this.loadError = 'load_failed';
		}
	}

	/** Adds a recipe to the top of the list and saves it. */
	async add(recipe: Recipe): Promise<void> {
		const previous = this.recipes;
		this.recipes = [recipe, ...previous];
		try {
			await this.api.save(recipe);
		} catch (error) {
			this.recipes = previous;
			throw error;
		}
	}

	/** Replaces the recipe with the same id and saves it. Unknown ids are ignored. */
	async update(recipe: Recipe): Promise<void> {
		const previous = this.recipes;
		if (!previous.some((r) => r.id === recipe.id)) return;
		this.recipes = previous.map((r) => (r.id === recipe.id ? recipe : r));
		try {
			await this.api.save(recipe);
		} catch (error) {
			this.recipes = previous;
			throw error;
		}
	}
}

export const recipeStore = new RecipeStore(serverApi);
