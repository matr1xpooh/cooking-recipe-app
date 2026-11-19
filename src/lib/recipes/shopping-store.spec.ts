import { describe, expect, it } from 'vitest';
import { SHOPPING_STORAGE_KEY } from './shopping';
import {
	addToShoppingList,
	clearShoppingList,
	readShoppingList,
	removeFromShoppingList,
	writeShoppingList,
	type ShoppingStorage
} from './shopping-store';

/** A storage that keeps values in memory. */
function memory(
	initial: Record<string, string> = {}
): ShoppingStorage & { data: Record<string, string> } {
	const data = { ...initial };
	return {
		data,
		getItem: (key) => data[key] ?? null,
		setItem: (key, value) => {
			data[key] = value;
		}
	};
}

describe('shopping list storage', () => {
	it('reads an empty list when nothing is saved', () => {
		expect(readShoppingList(memory())).toEqual({ ids: [], have: [] });
	});

	it('reads an empty list when the saved value cannot be read', () => {
		expect(readShoppingList(memory({ [SHOPPING_STORAGE_KEY]: '{not json' }))).toEqual({
			ids: [],
			have: []
		});
		expect(readShoppingList(null)).toEqual({ ids: [], have: [] });
	});

	it('adds recipes once each and keeps the ticks', () => {
		const storage = memory();
		writeShoppingList({ ids: ['a', 'b'], have: ['sugar'] }, storage);
		const saved = addToShoppingList(['b', 'c'], storage);
		expect(saved).toEqual({ ids: ['a', 'b', 'c'], have: ['sugar'] });
		expect(readShoppingList(storage)).toEqual(saved);
	});

	it('starts a list when none is saved', () => {
		expect(addToShoppingList(['a'], memory())).toEqual({ ids: ['a'], have: [] });
	});

	it('removes one recipe and keeps the rest', () => {
		const storage = memory();
		writeShoppingList({ ids: ['a', 'b'], have: ['eggs'] }, storage);
		expect(removeFromShoppingList('a', storage)).toEqual({ ids: ['b'], have: ['eggs'] });
	});

	it('clears the list and its ticks', () => {
		const storage = memory();
		writeShoppingList({ ids: ['a'], have: ['eggs'] }, storage);
		expect(clearShoppingList(storage)).toEqual({ ids: [], have: [] });
		expect(readShoppingList(storage)).toEqual({ ids: [], have: [] });
	});

	it('still works when storage cannot be written', () => {
		const broken: ShoppingStorage = {
			getItem: () => null,
			setItem: () => {
				throw new Error('full');
			}
		};
		expect(addToShoppingList(['a'], broken)).toEqual({ ids: ['a'], have: [] });
	});
});
