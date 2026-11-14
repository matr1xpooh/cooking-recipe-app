import { describe, expect, it } from 'vitest';
import {
	attachNotes,
	placeIngredients,
	groupIngredients,
	headingText,
	isHeading,
	joinNote,
	lineRange,
	noteBlocks,
	removeRange,
	splitNote
} from './ingredient-lines';
import { fromTexts, toItems, type RecipeFields } from './translation-fields';

describe('heading lines', () => {
	it('recognises a line that starts with the marker', () => {
		expect(isHeading('# For the Stir-fry')).toBe(true);
		expect(isHeading('2 tbsp. Cooking oil')).toBe(false);
		expect(isHeading('#no space')).toBe(false);
	});

	it('returns the heading words without the marker', () => {
		expect(headingText('# Beef Marinade')).toBe('Beef Marinade');
		expect(headingText('Salt')).toBe('Salt');
	});
});

describe('groupIngredients', () => {
	it('puts each heading over the ingredients below it', () => {
		expect(
			groupIngredients([
				'# Beef Marinade',
				'1 tbsp. Soy sauce',
				'1 tbsp. Wine',
				'# For the Stir-fry',
				'2 tbsp. Oil'
			])
		).toEqual([
			{ heading: 'Beef Marinade', items: ['1 tbsp. Soy sauce', '1 tbsp. Wine'] },
			{ heading: 'For the Stir-fry', items: ['2 tbsp. Oil'] }
		]);
	});

	it('keeps ingredients before the first heading in a group with no heading', () => {
		expect(groupIngredients(['Salt', '# Sauce', 'Honey'])).toEqual([
			{ heading: null, items: ['Salt'] },
			{ heading: 'Sauce', items: ['Honey'] }
		]);
	});

	it('leaves a list with no headings as one group', () => {
		expect(groupIngredients(['Salt', 'Pepper'])).toEqual([
			{ heading: null, items: ['Salt', 'Pepper'] }
		]);
	});

	it('keeps a heading that has no ingredients under it', () => {
		expect(groupIngredients(['# Sauce', '# Garnish', 'Parsley'])).toEqual([
			{ heading: 'Sauce', items: [] },
			{ heading: 'Garnish', items: ['Parsley'] }
		]);
	});

	it('returns no groups for an empty list', () => {
		expect(groupIngredients([])).toEqual([]);
	});
});

describe('translation keeps headings', () => {
	const fields: RecipeFields = {
		title: 'Stir-fry',
		ingredients: ['# Beef Marinade', '1 tbsp. Soy sauce'],
		steps: ['Cook.'],
		notes: ''
	};

	it('sends the heading without its marker', () => {
		const texts = toItems(fields).map((item) => item.text);
		expect(texts).toEqual(['Stir-fry', 'Beef Marinade', '1 tbsp. Soy sauce', 'Cook.', '']);
	});

	it('puts the marker back on the translated heading', () => {
		const translated = fromTexts(fields, [
			'Жаркое',
			'Маринад для говядины',
			'1 ст. л. соевого соуса',
			'Готовьте.',
			''
		]);
		expect(translated.ingredients).toEqual(['# Маринад для говядины', '1 ст. л. соевого соуса']);
	});
});

describe('note lines', () => {
	it('reads a note and its bullet', () => {
		expect(splitNote('> Sift first')).toEqual({ bullet: false, text: 'Sift first' });
		expect(splitNote('> - Sift first')).toEqual({ bullet: true, text: 'Sift first' });
		expect(splitNote('>')).toEqual({ bullet: false, text: '' });
		expect(splitNote('2 eggs')).toBeNull();
		expect(splitNote('>no space')).toBeNull();
	});

	it('writes a note line back the same way', () => {
		for (const line of ['> Sift first', '> - Sift first']) {
			expect(joinNote(splitNote(line)!)).toBe(line);
		}
	});

	it('attaches notes to the item above them', () => {
		expect(
			attachNotes(['2 eggs', '> Room temperature', '> - Separate the whites', '1 tbsp. Sugar'])
		).toEqual([
			{
				item: '2 eggs',
				notes: [
					{ bullet: false, text: 'Room temperature' },
					{ bullet: true, text: 'Separate the whites' }
				]
			},
			{ item: '1 tbsp. Sugar', notes: [] }
		]);
	});

	it('keeps notes before any item as a note with no item', () => {
		expect(attachNotes(['> Serves four', 'Salt'])).toEqual([
			{ item: null, notes: [{ bullet: false, text: 'Serves four' }] },
			{ item: 'Salt', notes: [] }
		]);
	});

	it('groups consecutive bullets into one list', () => {
		const notes = [
			{ bullet: true, text: 'a' },
			{ bullet: true, text: 'b' },
			{ bullet: false, text: 'c' },
			{ bullet: true, text: 'd' }
		];
		expect(noteBlocks(notes)).toEqual([
			{ kind: 'list', items: [notes[0], notes[1]] },
			{ kind: 'paragraph', line: notes[2] },
			{ kind: 'list', items: [notes[3]] }
		]);
	});

	it('keeps notes inside a heading group', () => {
		expect(groupIngredients(['# Sauce', '1 tbsp. Soy', '> Light soy'])).toEqual([
			{ heading: 'Sauce', items: ['1 tbsp. Soy', '> Light soy'] }
		]);
	});
});

describe('translation keeps notes', () => {
	const fields: RecipeFields = {
		title: 'Omelette',
		ingredients: ['2 eggs', '> - Room temperature'],
		steps: ['Whisk.', '> Use a non-stick pan.'],
		notes: ''
	};

	it('sends each note as its text, without the marker', () => {
		const texts = toItems(fields).map((item) => item.text);
		expect(texts).toEqual([
			'Omelette',
			'2 eggs',
			'Room temperature',
			'Whisk.',
			'Use a non-stick pan.',
			''
		]);
	});

	it('puts the note markers and bullets back on the translation', () => {
		const translated = fromTexts(fields, [
			'Омлет',
			'2 яйца',
			'комнатной температуры',
			'Взбейте.',
			'Используйте антипригарную сковороду.',
			''
		]);
		expect(translated).toEqual({
			title: 'Омлет',
			ingredients: ['2 яйца', '> - комнатной температуры'],
			steps: ['Взбейте.', '> Используйте антипригарную сковороду.'],
			notes: ''
		});
	});
});

describe('placeIngredients', () => {
	it('keeps each line at its position in the stored list', () => {
		const groups = placeIngredients(['# Sauce', '2 eggs', '> - whisked', '# Base', '1 cup flour']);
		expect(groups).toEqual([
			{
				heading: { text: 'Sauce', index: 0 },
				items: [
					{
						item: { text: '2 eggs', index: 1 },
						notes: [{ note: { bullet: true, text: 'whisked' }, index: 2 }]
					}
				]
			},
			{
				heading: { text: 'Base', index: 3 },
				items: [{ item: { text: '1 cup flour', index: 4 }, notes: [] }]
			}
		]);
	});
});

describe('deleting a line', () => {
	it('takes the line and the notes written under it', () => {
		const lines = ['2 eggs', '> Room temperature', '1 onion', '3 garlic'];
		expect(lineRange(lines, 0)).toEqual({ start: 0, end: 2 });
		expect(removeRange(lines, lineRange(lines, 0))).toEqual(['1 onion', '3 garlic']);
	});

	it('takes only the line when it has no notes', () => {
		const lines = ['2 eggs', '1 onion', '3 garlic'];
		expect(removeRange(lines, lineRange(lines, 1))).toEqual(['2 eggs', '3 garlic']);
	});

	it('takes the last line with its notes at the end of the list', () => {
		const lines = ['2 eggs', '1 onion', '> Sweet'];
		expect(removeRange(lines, lineRange(lines, 1))).toEqual(['2 eggs']);
		expect(removeRange(['a', '> x'], lineRange(['a', '> x'], 0))).toEqual([]);
	});
});
