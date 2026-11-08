import { normalizeTag, normalizeTags, type Recipe } from './recipe';
import { deleteRecipe, fetchRecipes, postRecipe } from './recipe-api';
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
	remove(id: string): Promise<void>;
	migrate(): Promise<void>;
}

const serverApi: RecipeApi = {
	list: fetchRecipes,
	save: postRecipe,
	remove: deleteRecipe,
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

	/**
	 * Archives or restores several recipes, one save each. If the server refuses one,
	 * the list is reloaded from the server, so the screen matches what was saved.
	 */
	async setArchived(ids: string[], archived: boolean): Promise<void> {
		try {
			for (const id of ids) {
				const current = this.recipes.find((r) => r.id === id);
				if (!current || current.archived === archived) continue;
				const next = { ...current, archived };
				await this.api.save(next);
				this.recipes = this.recipes.map((r) => (r.id === id ? next : r));
			}
		} catch (error) {
			this.recipes = await this.api.list();
			throw error;
		}
	}

	/** Permanently deletes recipes, with their screenshots. Reloads from the server on failure. */
	async remove(ids: string[]): Promise<void> {
		try {
			for (const id of ids) {
				await this.api.remove(id);
				this.recipes = this.recipes.filter((r) => r.id !== id);
			}
		} catch (error) {
			this.recipes = await this.api.list();
			throw error;
		}
	}

	/**
	 * Renames a tag on every recipe that has it. Renaming to a tag that already exists
	 * merges the two. Reloads from the server if a save is refused.
	 */
	async renameTag(from: string, to: string): Promise<void> {
		const target = normalizeTag(to);
		if (!target || target === from) return;
		await this.changeTags(from, (tags) =>
			normalizeTags(tags.map((t) => (t === from ? target : t)))
		);
	}

	/** Removes a tag from every recipe that has it. */
	async removeTag(tag: string): Promise<void> {
		await this.changeTags(tag, (tags) => tags.filter((t) => t !== tag));
	}

	private async changeTags(tag: string, change: (tags: string[]) => string[]): Promise<void> {
		try {
			for (const recipe of this.recipes.filter((r) => r.tags.includes(tag))) {
				const next = { ...recipe, tags: change(recipe.tags) };
				await this.api.save(next);
				this.recipes = this.recipes.map((r) => (r.id === next.id ? next : r));
			}
		} catch (error) {
			this.recipes = await this.api.list();
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
