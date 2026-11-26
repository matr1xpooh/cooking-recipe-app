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

	it('keeps the scale each recipe was added at', () => {
		const storage = memory();
		addToShoppingList(['a'], storage, 2);
		addToShoppingList(['b'], storage);
		expect(readShoppingList(storage)).toEqual({ ids: ['a', 'b'], have: [], scales: { a: 2 } });
	});

	it('replaces the scale when a recipe on the list is added again', () => {
		const storage = memory();
		addToShoppingList(['a'], storage, 2);
		addToShoppingList(['a'], storage, 0.5);
		expect(readShoppingList(storage).scales).toEqual({ a: 0.5 });
		addToShoppingList(['a'], storage);
		expect(readShoppingList(storage)).toEqual({ ids: ['a'], have: [] });
	});

	it('reads a list saved before scales existed as all ×1', () => {
		const storage = memory({ [SHOPPING_STORAGE_KEY]: JSON.stringify({ ids: ['a'], have: [] }) });
		expect(readShoppingList(storage)).toEqual({ ids: ['a'], have: [] });
	});

	it('drops scales that are not positive numbers, and scales of removed recipes', () => {
		const storage = memory({
			[SHOPPING_STORAGE_KEY]: JSON.stringify({
				ids: ['a', 'b'],
				have: [],
				scales: { a: -1, b: 'two', c: 3 }
			})
		});
		expect(readShoppingList(storage)).toEqual({ ids: ['a', 'b'], have: [] });
	});

	it('keeps a removed recipe from leaving its scale behind', () => {
		const storage = memory();
		addToShoppingList(['a', 'b'], storage, 2);
		expect(removeFromShoppingList('a', storage)).toEqual({
			ids: ['b'],
			have: [],
			scales: { b: 2 }
		});
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
