/**
 * Screenshots kept as the original file, one per recipe. Stored in IndexedDB,
 * which holds binary files; localStorage is too small for images. Browser only.
 */

const DB_NAME = 'recipe-images';
const STORE = 'images';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** Runs one request in a transaction and resolves with its result once the transaction commits. */
async function run<T>(
	mode: IDBTransactionMode,
	action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const tx = db.transaction(STORE, mode);
			const request = action(tx.objectStore(STORE));
			let result: T;
			request.onsuccess = () => (result = request.result);
			tx.oncomplete = () => resolve(result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

/** Saves the file exactly as given (no re-encoding), replacing any earlier one. */
export async function saveImage(recipeId: string, file: Blob): Promise<void> {
	await run('readwrite', (store) => store.put(file, recipeId));
}

export async function loadImage(recipeId: string): Promise<Blob | null> {
	const result = await run<Blob | undefined>('readonly', (store) => store.get(recipeId));
	return result ?? null;
}
