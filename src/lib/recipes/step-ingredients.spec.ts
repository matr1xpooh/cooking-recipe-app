import { describe, expect, it } from 'vitest';
import { ingredientName, ingredientsPerStep, mentionsRemaining } from './step-ingredients';

/** The ingredients of one step, when it is the only step. */
function forStep(step: string, ingredients: string[]) {
	return ingredientsPerStep([step], ingredients)[0];
}

describe('ingredientName', () => {
	it('keeps the words before the first amount', () => {
		expect(ingredientName('Творог 12 % 750 г')).toBe('Творог');
		expect(ingredientName('Яйца 4 шт.')).toBe('Яйца');
		expect(ingredientName('Сливочное масло 50 г')).toBe('Сливочное масло');
		expect(ingredientName('Salt to taste')).toBe('Salt to taste');
	});
});

describe('ingredientsPerStep', () => {
	const list = [
		'Сливочное масло 50 г',
		'Творог 12 % 750 г',
		'Сахар 200 г',
		'Ванильный сахар 10 г',
		'Лимон 1 шт.'
	];

	it('finds the ingredients named in a Russian step, in list order', () => {
		const step = 'Добавить в творожную массу ванильный сахар, 200 г сахара, и тщательно замешать.';
		expect(forStep(step, list)).toEqual([
			{ index: 1, remaining: false },
			{ index: 2, remaining: false },
			{ index: 3, remaining: false }
		]);
	});

	it('matches word endings, so "масло" and "масла" both count', () => {
		expect(forStep('Масло растопить в сотейнике.', list)).toEqual([{ index: 0, remaining: false }]);
	});

	it('matches an ingredient written in the recipe language, such as "чили"', () => {
		expect(forStep('Мелко нарезаем чили и добавляем в соус', ['Чили перец по вкусу'])).toEqual([
			{ index: 0, remaining: false }
		]);
	});

	it('returns nothing when no ingredient is named', () => {
		expect(forStep('Отправить в духовку на час.', list)).toEqual([]);
	});

	it('marks an ingredient as remaining when the step says so', () => {
		expect(forStep('Используем оставшееся масло для крошки.', list)).toEqual([
			{ index: 0, remaining: true }
		]);
	});

	it('marks remaining in English and does not mark a normal step', () => {
		const english = ['Butter 50 g', 'Flour 60 g'];
		expect(forStep('Use the remaining butter.', english)).toEqual([{ index: 0, remaining: true }]);
		expect(forStep('Melt the butter.', english)).toEqual([{ index: 0, remaining: false }]);
	});

	it('skips headings and notes in the ingredient list', () => {
		const withHeading = ['# Sauce', '> a note', 'Butter 50 g'];
		expect(forStep('Melt the butter.', withHeading)).toEqual([{ index: 2, remaining: false }]);
	});

	it('does not show an ingredient again when a later step names it as the same item', () => {
		const lines = ['Eggplant - 2 pieces', 'Salt 5 g'];
		const perStep = ingredientsPerStep(
			['Slice the eggplant into rounds.', 'Fry the eggplants in two batches until golden.'],
			lines
		);
		expect(perStep[0]).toEqual([{ index: 0, remaining: false }]);
		expect(perStep[1]).toEqual([]);
	});

	it('shows an ingredient again when a later step gives a new amount', () => {
		const perStep = ingredientsPerStep(
			['Slice the eggplant.', 'Add 2 eggplants more to the pan.'],
			['Eggplant - 2 pieces']
		);
		expect(perStep[1]).toEqual([{ index: 0, remaining: false }]);
	});

	it('shows an ingredient again when a later step says "remaining"', () => {
		const perStep = ingredientsPerStep(
			['Melt 50 g of butter.', 'Brush the tin with the remaining butter.'],
			['Butter 50 g']
		);
		expect(perStep[0]).toEqual([{ index: 0, remaining: false }]);
		expect(perStep[1]).toEqual([{ index: 0, remaining: true }]);
	});
});

describe('mentionsRemaining', () => {
	it('recognises the phrase in each supported language', () => {
		expect(mentionsRemaining('use the remaining butter')).toBe(true);
		expect(mentionsRemaining('usa la mantequilla restante')).toBe(true);
		expect(mentionsRemaining('fes servir la mantega restant')).toBe(true);
		expect(mentionsRemaining('используем оставшееся масло')).toBe(true);
		expect(mentionsRemaining('Оставить мариноваться 10 минут.')).toBe(false);
		expect(mentionsRemaining('Оставляем баклажаны на 20 минут.')).toBe(false);
		expect(mentionsRemaining('melt the butter')).toBe(false);
	});
});
