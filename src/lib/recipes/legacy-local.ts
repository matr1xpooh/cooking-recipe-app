import type { Recipe } from './recipe';
import { fetchRecipes, getImage, postRecipe, putImage } from './recipe-api';
import { isRecipe, normalizeRecipe } from './validate';

/**
 * Recipes and screenshots from before they moved to the server, which were kept in
 * this browser. Moved to the server once, then removed from the browser. Nothing is
 * removed unless every item was saved.
 */

const LEGACY_RECIPES_KEY = 'recipes.v1';
const LEGACY_IMAGE_DB = 'recipe-images';
const LEGACY_IMAGE_STORE = 'images';

function readLegacyRecipes(): Recipe[] {
	const raw = localStorage.getItem(LEGACY_RECIPES_KEY);
	if (raw === null) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter(isRecipe).map(normalizeRecipe) : [];
	} catch {
		return [];
	}
}

function openLegacyImages(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(LEGACY_IMAGE_DB, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(LEGACY_IMAGE_STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function readLegacyImage(recipeId: string): Promise<Blob | null> {
	const db = await openLegacyImages();
	try {
		return await new Promise<Blob | null>((resolve, reject) => {
			const tx = db.transaction(LEGACY_IMAGE_STORE, 'readonly');
			const request = tx.objectStore(LEGACY_IMAGE_STORE).get(recipeId);
			let result: Blob | null = null;
			request.onsuccess = () => (result = (request.result as Blob | undefined) ?? null);
			tx.oncomplete = () => resolve(result);
			tx.onerror = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

function deleteLegacyImages(): Promise<void> {
	return new Promise((resolve) => {
		const request = indexedDB.deleteDatabase(LEGACY_IMAGE_DB);
		request.onsuccess = () => resolve();
		request.onerror = () => resolve();
		request.onblocked = () => resolve();
	});
}

/**
 * Moves browser-held recipes whose ids are not on the server yet. A failure leaves
 * the browser copy in place, so the move is retried next time.
 */
export async function migrateLegacyRecipes(): Promise<void> {
	if (typeof localStorage === 'undefined') return;
	const legacy = readLegacyRecipes();
	if (legacy.length === 0) {
		localStorage.removeItem(LEGACY_RECIPES_KEY);
		return;
	}
	const onServer = await fetchRecipes();
	const serverIds = new Set(onServer.map((r) => r.id));
	const missing = legacy.filter((r) => !serverIds.has(r.id));

	// Oldest first, so the newest ends up at the top, as before.
	for (const recipe of [...missing].reverse()) {
		if (recipe.hasImage) {
			const blob = await readLegacyImage(recipe.id);
			if (blob) await putImage(recipe.id, blob);
		}
		await postRecipe(recipe);
	}

	// Check the copy arrived before the browser copy is removed.
	const checkIds = new Set((await fetchRecipes()).map((r) => r.id));
	if (legacy.some((r) => !checkIds.has(r.id))) throw new Error('migration incomplete');
	for (const recipe of legacy.filter((r) => r.hasImage)) {
		if ((await getImage(recipe.id)) === null) {
			const blob = await readLegacyImage(recipe.id);
			if (blob) throw new Error('image migration incomplete');
		}
	}
	localStorage.removeItem(LEGACY_RECIPES_KEY);
	await deleteLegacyImages();
}
