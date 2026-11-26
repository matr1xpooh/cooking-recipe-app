import { SHOPPING_STORAGE_KEY } from './shopping';

/** The part of the Web Storage API the shopping list uses. */
export interface ShoppingStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/**
 * The recipes on the list, the ingredient keys ticked as "I have it", and the scale each recipe
 * was added at (a factor such as 0.5 or 2). A recipe with no entry in `scales` is at ×1; lists
 * saved before scales existed have none.
 */
export interface ShoppingSaved {
	ids: string[];
	have: string[];
	scales?: Record<string, number>;
}

const EMPTY: ShoppingSaved = { ids: [], have: [] };

/** Scales that are positive numbers, keyed by recipe id. Anything else is dropped. */
function scalesOf(value: unknown): Record<string, number> {
	if (typeof value !== 'object' || value === null) return {};
	const out: Record<string, number> = {};
	for (const [id, factor] of Object.entries(value)) {
		if (typeof factor === 'number' && factor > 0 && factor !== 1) out[id] = factor;
	}
	return out;
}

/** The saved shape, with `scales` only when some recipe is not at ×1. */
function listOf(ids: string[], have: string[], scales: Record<string, number>): ShoppingSaved {
	const kept = Object.fromEntries(Object.entries(scales).filter(([id]) => ids.includes(id)));
	return Object.keys(kept).length > 0 ? { ids, have, scales: kept } : { ids, have };
}

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
		const ids = strings((value as { ids?: unknown }).ids);
		const have = strings((value as { have?: unknown }).have);
		return listOf(ids, have, scalesOf((value as { scales?: unknown }).scales));
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

/**
 * Adds recipes to the list, each once. The ticks already made are kept. Each added recipe takes
 * the given scale (×1 when omitted); a recipe already on the list takes the new scale.
 */
export function addToShoppingList(
	ids: string[],
	storage: ShoppingStorage | null = browserStorage(),
	factor = 1
): ShoppingSaved {
	const current = readShoppingList(storage);
	const merged = [...current.ids, ...ids.filter((id) => !current.ids.includes(id))];
	const scales = { ...(current.scales ?? {}) };
	for (const id of ids) {
		if (factor === 1) delete scales[id];
		else scales[id] = factor;
	}
	const saved = listOf(merged, current.have, scales);
	writeShoppingList(saved, storage);
	return saved;
}

/** Takes one recipe off the list. */
export function removeFromShoppingList(
	id: string,
	storage: ShoppingStorage | null = browserStorage()
): ShoppingSaved {
	const current = readShoppingList(storage);
	const saved = listOf(
		current.ids.filter((x) => x !== id),
		current.have,
		current.scales ?? {}
	);
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
