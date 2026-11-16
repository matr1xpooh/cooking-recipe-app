import { describe, expect, it } from 'vitest';
import { recipeToText, type ShareLabels } from './share-text';
import type { RecipeFields } from './translation-fields';

const labels: ShareLabels = {
	ingredients: 'Ingredients',
	steps: 'Steps',
	notes: 'Notes',
	source: 'Source'
};

function fields(parts: Partial<RecipeFields>): RecipeFields {
	return { title: 'Cake', ingredients: [], steps: [], notes: '', ...parts };
}

describe('recipeToText', () => {
	it('writes the title, sections and source link in order', () => {
		const text = recipeToText(
			fields({ ingredients: ['Flour 200 g'], steps: ['Mix'], notes: 'Serve warm' }),
			labels,
			'https://example.org/cake'
		);
		expect(text).toBe(
			[
				'Cake',
				'Ingredients\n- Flour 200 g',
				'Steps\n1. Mix',
				'Notes\nServe warm',
				'Source: https://example.org/cake'
			].join('\n\n')
		);
	});

	it('numbers steps across section names, as the page does', () => {
		const text = recipeToText(fields({ steps: ['A', '# Sauce', 'B'] }), labels, null);
		expect(text).toContain('1. A\nSauce:\n2. B');
	});

	it('writes a tip under the step above it with an arrow', () => {
		const text = recipeToText(fields({ steps: ['Whip', '> Use cold cream'] }), labels, null);
		expect(text).toContain('1. Whip\n   ↳ Use cold cream');
	});

	it('keeps the link in a note and drops its styling', () => {
		const text = recipeToText(
			fields({ notes: 'See **this** [site](https://example.org) now' }),
			labels,
			null
		);
		expect(text).toContain('See this site (https://example.org) now');
	});

	it('leaves out empty parts', () => {
		expect(recipeToText(fields({}), labels, null)).toBe('Cake');
	});

	it('keeps the start time in the source link it is given', () => {
		const text = recipeToText(fields({}), labels, 'https://youtu.be/x?t=90s');
		expect(text).toBe('Cake\n\nSource: https://youtu.be/x?t=90s');
	});
});
