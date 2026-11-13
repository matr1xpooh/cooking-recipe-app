import { attachNotes, type NoteLine } from './ingredient-lines.js';

/** One step as the cook sees it: its text and the notes written under it. */
export interface CookStep {
	text: string;
	notes: NoteLine[];
}

/**
 * The steps to show one at a time. Notes written before the first step have no step to
 * belong to, so they are not shown in cooking mode.
 */
export function cookSteps(lines: string[]): CookStep[] {
	const steps: CookStep[] = [];
	for (const entry of attachNotes(lines)) {
		if (entry.item !== null) steps.push({ text: entry.item, notes: entry.notes });
	}
	return steps;
}

/** A step number kept inside the list. An empty list stays at 0. */
export function clampStep(index: number, count: number): number {
	if (count <= 0) return 0;
	return Math.min(count - 1, Math.max(0, index));
}
