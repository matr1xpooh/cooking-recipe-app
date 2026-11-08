import { describe, it, expect } from 'vitest';
import { suggestTags } from './tag-suggest';

describe('suggestTags', () => {
	it('suggests from ingredient words, including plurals', () => {
		expect(suggestTags('2 chicken thighs\n1 tbsp soy')).toEqual(['poultry']);
		expect(suggestTags('beef, onion')).toEqual(['meat']);
	});

	it('suggests several tags for one recipe', () => {
		expect(suggestTags('Beef and carrot soup')).toEqual(['meat', 'soup']);
	});

	it('matches Russian by stem', () => {
		expect(suggestTags('курица, 2 яйца, мука')).toEqual(['poultry', 'baking']);
	});

	it('does not match inside other words', () => {
		expect(suggestTags('1 teaspoon salt')).toEqual([]);
		expect(suggestTags('pancake batter')).toEqual([]);
	});

	it('returns nothing for text with no food words', () => {
		expect(suggestTags('Mix well and serve.')).toEqual([]);
	});
});
