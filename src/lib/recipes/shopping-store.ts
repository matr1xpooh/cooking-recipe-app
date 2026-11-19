import { SHOPPING_STORAGE_KEY } from './shopping';

/** The part of the Web Storage API the shopping list uses. */
export interface ShoppingStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** The recipes on the list, and the ingredient keys ticked as "I have it". */
export interface ShoppingSaved {
	ids: string[];
	have: string[];
}

const EMPTY: ShoppingSaved = { ids: [], have: [] };

/** This browser's storage, or null when it cannot be reached (private mode, blocked). */
function browserStorage(): ShoppingStorage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** The saved list; an empty one when nothing is saved or what is saved cannot be read. */
export function readShoppingList(
	storage: ShoppingStorage | null = browserStorage()
): ShoppingSaved {
	try {
		const raw = storage?.getItem(SHOPPING_STORAGE_KEY);
		if (!raw) return { ids: [], have: [] };
		const value: unknown = JSON.parse(raw);
		if (typeof value !== 'object' || value === null) return { ids: [], have: [] };
		return {
			ids: strings((value as { ids?: unknown }).ids),
			have: strings((value as { have?: unknown }).have)
		};
	} catch {
		return { ids: [], have: [] };
	}
}

/** Saves the list. Storage that is full or blocked is ignored: the list still works for this visit. */
export function writeShoppingList(
	saved: ShoppingSaved,
	storage: ShoppingStorage | null = browserStorage()
): void {
	try {
		storage?.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(saved));
	} catch {
		// Storage can be full or blocked.
	}
}

/** Adds recipes to the list, each once. The ticks already made are kept. */
export function addToShoppingList(
	ids: string[],
	storage: ShoppingStorage | null = browserStorage()
): ShoppingSaved {
	const current = readShoppingList(storage);
	const merged = [...current.ids, ...ids.filter((id) => !current.ids.includes(id))];
	const saved = { ids: merged, have: current.have };
	writeShoppingList(saved, storage);
	return saved;
}

/** Takes one recipe off the list. */
export function removeFromShoppingList(
	id: string,
	storage: ShoppingStorage | null = browserStorage()
): ShoppingSaved {
	const current = readShoppingList(storage);
	const saved = { ids: current.ids.filter((x) => x !== id), have: current.have };
	writeShoppingList(saved, storage);
	return saved;
}

/** Empties the list and clears its ticks. */
export function clearShoppingList(
	storage: ShoppingStorage | null = browserStorage()
): ShoppingSaved {
	writeShoppingList(EMPTY, storage);
	return { ids: [], have: [] };
}
