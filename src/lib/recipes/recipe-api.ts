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

/** Thrown when the address is already saved as another recipe. */
export class DuplicateRecipeError extends Error {
	constructor(readonly existing: { id: string; title: string }) {
		super('duplicate');
	}
}

export async function postRecipe(recipe: Recipe): Promise<void> {
	const res = await fetch('/api/recipes', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(recipe)
	});
	if (res.status === 409) {
		const body = await res.json();
		throw new DuplicateRecipeError(body.existing);
	}
	if (!res.ok) throw new Error(`save failed: ${res.status}`);
}

/** Stores one original image for a recipe. Returns the new image's id. */
export async function uploadImage(recipeId: string, file: Blob): Promise<string> {
	const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}/images`, {
		method: 'POST',
		headers: { 'content-type': file.type || 'application/octet-stream' },
		body: file
	});
	if (!res.ok) throw new Error(`image save failed: ${res.status}`);
	return (await res.json()).id;
}

/** One stored image of a recipe, or null when it is not there. */
export async function fetchImage(recipeId: string, imageId: string): Promise<Blob | null> {
	const res = await fetch(
		`/api/recipes/${encodeURIComponent(recipeId)}/images/${encodeURIComponent(imageId)}`
	);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`image load failed: ${res.status}`);
	return res.blob();
}

export async function deleteImage(recipeId: string, imageId: string): Promise<void> {
	const res = await fetch(
		`/api/recipes/${encodeURIComponent(recipeId)}/images/${encodeURIComponent(imageId)}`,
		{ method: 'DELETE' }
	);
	if (!res.ok && res.status !== 404) throw new Error(`image delete failed: ${res.status}`);
}

export async function deleteRecipe(recipeId: string): Promise<void> {
	const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}`, { method: 'DELETE' });
	if (!res.ok && res.status !== 404) throw new Error(`delete failed: ${res.status}`);
}

/**
 * A picture from the web, fetched by the server. Returns null when the picture
 * can't be fetched, since a recipe does not need one.
 */
export async function fetchPicture(pageImageUrl: string): Promise<Blob | null> {
	try {
		const res = await fetch(`/api/recipes/import-image?url=${encodeURIComponent(pageImageUrl)}`);
		return res.ok ? await res.blob() : null;
	} catch {
		return null;
	}
}

/** A translation edited by hand: the source text it was made from, and the fields. */
export interface EditedTranslation {
	hash: string;
	fields: { title: string; ingredients: string[]; steps: string[]; notes: string };
}

/** The edited translation of a recipe into a language, or null when there is none. */
export async function fetchOverride(
	recipeId: string,
	language: string
): Promise<EditedTranslation | null> {
	const res = await fetch(
		`/api/recipes/${encodeURIComponent(recipeId)}/translations/${encodeURIComponent(language)}`
	);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`translation load failed: ${res.status}`);
	return res.json();
}

export async function saveOverride(
	recipeId: string,
	language: string,
	value: EditedTranslation
): Promise<void> {
	const res = await fetch(
		`/api/recipes/${encodeURIComponent(recipeId)}/translations/${encodeURIComponent(language)}`,
		{ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }
	);
	if (!res.ok) throw new Error(`translation save failed: ${res.status}`);
}

export async function deleteOverride(recipeId: string, language: string): Promise<void> {
	const res = await fetch(
		`/api/recipes/${encodeURIComponent(recipeId)}/translations/${encodeURIComponent(language)}`,
		{ method: 'DELETE' }
	);
	if (!res.ok && res.status !== 404) throw new Error(`translation reset failed: ${res.status}`);
}
