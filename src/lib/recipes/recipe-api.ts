import type { Recipe } from './recipe';
import { isRecipe, normalizeRecipe } from './validate';

/** Browser-side calls to the recipe endpoints. Throws when the server refuses or is unreachable. */

export async function fetchRecipes(): Promise<Recipe[]> {
	const res = await fetch('/api/recipes');
	if (!res.ok) throw new Error(`list failed: ${res.status}`);
	const body: unknown = await res.json();
	if (!Array.isArray(body)) throw new Error('list: unexpected response');
	return body.filter(isRecipe).map(normalizeRecipe);
}

export async function postRecipe(recipe: Recipe): Promise<void> {
	const res = await fetch('/api/recipes', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(recipe)
	});
	if (!res.ok) throw new Error(`save failed: ${res.status}`);
}

/** Stores a screenshot's original bytes for a recipe. */
export async function putImage(recipeId: string, file: Blob): Promise<void> {
	const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}/image`, {
		method: 'PUT',
		headers: { 'content-type': file.type || 'application/octet-stream' },
		body: file
	});
	if (!res.ok) throw new Error(`image save failed: ${res.status}`);
}

/** The stored screenshot for a recipe, or null when there is none. */
export async function getImage(recipeId: string): Promise<Blob | null> {
	const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}/image`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`image load failed: ${res.status}`);
	return res.blob();
}
