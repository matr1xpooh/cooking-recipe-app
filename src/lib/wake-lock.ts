/**
 * Keeps the screen awake while a recipe is open (Screen Wake Lock API). The lock is
 * released by the browser when the page is hidden, so it is taken again when the page
 * comes back. Where the API is missing or refused, this does nothing.
 */

export interface WakeLockSentinelLike {
	release(): Promise<void>;
	addEventListener(type: 'release', listener: () => void): void;
}

export interface WakeLockApi {
	request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

export interface VisibilityDocument {
	visibilityState: string;
	addEventListener(type: 'visibilitychange', listener: () => void): void;
	removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** Starts keeping the screen awake. Returns a function that stops it. */
export function keepScreenAwake(
	api: WakeLockApi | undefined = typeof navigator !== 'undefined' ? navigator.wakeLock : undefined,
	doc: VisibilityDocument | undefined = typeof document !== 'undefined' ? document : undefined
): () => void {
	if (!api || !doc) return () => {};

	let sentinel: WakeLockSentinelLike | null = null;
	let stopped = false;

	const acquire = async (): Promise<void> => {
		if (stopped || sentinel || doc.visibilityState !== 'visible') return;
		try {
			const lock = await api.request('screen');
			if (stopped) {
				void lock.release().catch(() => {});
				return;
			}
			sentinel = lock;
			lock.addEventListener('release', () => {
				if (sentinel === lock) sentinel = null;
			});
		} catch {
			// Refused (for example, low battery or no user gesture): the screen may sleep.
		}
	};

	const onVisibilityChange = () => {
		if (doc.visibilityState === 'visible') void acquire();
	};

	doc.addEventListener('visibilitychange', onVisibilityChange);
	void acquire();

	return () => {
		stopped = true;
		doc.removeEventListener('visibilitychange', onVisibilityChange);
		const held = sentinel;
		sentinel = null;
		if (held) void held.release().catch(() => {});
	};
}
