import type { Action } from 'svelte/action';

export interface LongPressOptions {
	/** Called when the press has lasted long enough. */
	onPress: () => void;
	/** When false, the element behaves as before. */
	enabled?: boolean;
	/** Milliseconds the press must last. */
	ms?: number;
	/** Pixels the pointer may move before the press counts as scrolling, not holding. */
	slop?: number;
}

/**
 * Press and hold on an element (mouse or touch). Moving the pointer, letting go early or the
 * browser taking over for a scroll cancels it. After a press that fired, the click that follows
 * the release is swallowed, so a link inside the element does not open.
 */
export const longPress: Action<HTMLElement, LongPressOptions> = (node, initial) => {
	let options = initial;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let start: { x: number; y: number } | null = null;
	let fired = false;

	const cancel = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
		start = null;
	};

	const down = (event: PointerEvent) => {
		if (options.enabled === false) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		fired = false;
		start = { x: event.clientX, y: event.clientY };
		timer = setTimeout(() => {
			timer = null;
			start = null;
			fired = true;
			options.onPress();
		}, options.ms ?? 450);
	};

	const move = (event: PointerEvent) => {
		if (!start) return;
		const slop = options.slop ?? 8;
		if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > slop) cancel();
	};

	const click = (event: MouseEvent) => {
		if (!fired) return;
		fired = false;
		event.preventDefault();
		event.stopPropagation();
	};

	// Long press on a touch screen opens the phone's own menu; that is not wanted on a row.
	const menu = (event: Event) => {
		if (options.enabled !== false) event.preventDefault();
	};

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', cancel);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('pointerleave', cancel);
	node.addEventListener('click', click, true);
	node.addEventListener('contextmenu', menu);

	return {
		update(next) {
			options = next;
		},
		destroy() {
			cancel();
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', cancel);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('pointerleave', cancel);
			node.removeEventListener('click', click, true);
			node.removeEventListener('contextmenu', menu);
		}
	};
};
