/**
 * Text size for the whole app. The steps are percentages of the base font size. Every size in
 * app.css is in rem, so changing the root font size scales the whole app. The smaller steps
 * go below the OS baseline, which pinch zoom cannot reach on Android.
 */
export const TEXT_SIZE_STEPS = [50, 62.5, 75, 87.5, 100, 115, 130, 150] as const;

export const DEFAULT_TEXT_SIZE_INDEX = 4;

export const TEXT_SIZE_STORAGE_KEY = 'text-size';

/** The step one place up or down, kept inside the range. */
export function nextTextSizeIndex(index: number, direction: 1 | -1): number {
	return Math.min(TEXT_SIZE_STEPS.length - 1, Math.max(0, index + direction));
}

/** The saved step, or the default when nothing valid is saved. */
export function readTextSizeIndex(saved: string | null | undefined): number {
	if (saved === null || saved === undefined || !/^\d+$/.test(saved)) {
		return DEFAULT_TEXT_SIZE_INDEX;
	}
	const index = Number(saved);
	return index < TEXT_SIZE_STEPS.length ? index : DEFAULT_TEXT_SIZE_INDEX;
}

export function textSizePercent(index: number): string {
	return `${TEXT_SIZE_STEPS[index]}%`;
}
