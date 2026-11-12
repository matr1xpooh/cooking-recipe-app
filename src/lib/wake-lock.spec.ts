import { describe, expect, it } from 'vitest';
import { keepScreenAwake, type VisibilityDocument, type WakeLockSentinelLike } from './wake-lock';

function fakeDoc(
	visibilityState = 'visible'
): VisibilityDocument & { fire(): void; listeners: number } {
	const listeners = new Set<() => void>();
	return {
		visibilityState,
		addEventListener: (_type, listener) => listeners.add(listener),
		removeEventListener: (_type, listener) => listeners.delete(listener),
		fire() {
			for (const listener of listeners) listener();
		},
		get listeners() {
			return listeners.size;
		}
	};
}

function fakeLock() {
	const releaseListeners: Array<() => void> = [];
	let released = 0;
	const lock: WakeLockSentinelLike = {
		release: async () => {
			released++;
			for (const listener of releaseListeners) listener();
		},
		addEventListener: (_type, listener) => releaseListeners.push(listener)
	};
	return {
		lock,
		get released() {
			return released;
		}
	};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('keepScreenAwake', () => {
	it('does nothing where the API is missing', () => {
		const stop = keepScreenAwake(undefined, fakeDoc());
		expect(() => stop()).not.toThrow();
	});

	it('takes the lock when the page is visible and releases it on stop', async () => {
		const doc = fakeDoc();
		const held = fakeLock();
		let requests = 0;
		const stop = keepScreenAwake({ request: async () => (requests++, held.lock) }, doc);
		await flush();
		expect(requests).toBe(1);
		stop();
		await flush();
		expect(held.released).toBe(1);
		expect(doc.listeners).toBe(0);
	});

	it('takes the lock again when the page becomes visible after the browser released it', async () => {
		const doc = fakeDoc('hidden');
		const first = fakeLock();
		const second = fakeLock();
		const locks = [first, second];
		let requests = 0;
		const stop = keepScreenAwake({ request: async () => (requests++, locks.shift()!.lock) }, doc);
		await flush();
		expect(requests).toBe(0);

		doc.visibilityState = 'visible';
		doc.fire();
		await flush();
		expect(requests).toBe(1);
		stop();
	});

	it('stays quiet when the request is refused', async () => {
		const stop = keepScreenAwake(
			{ request: async () => Promise.reject(new Error('NotAllowedError')) },
			fakeDoc()
		);
		await flush();
		expect(() => stop()).not.toThrow();
	});
});
