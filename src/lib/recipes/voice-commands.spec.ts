import { describe, expect, it } from 'vitest';
import { parseCommand } from './voice-commands';

describe('parseCommand', () => {
	it('finds the command word in English, ignoring case and punctuation', () => {
		expect(parseCommand('Next.', 'en')).toBe('next');
		expect(parseCommand('go back please', 'en')).toBe('back');
		expect(parseCommand('REPEAT', 'en')).toBe('repeat');
	});

	it('finds the command words in the other interface languages', () => {
		expect(parseCommand('siguiente', 'es')).toBe('next');
		expect(parseCommand('¡atrás!', 'es')).toBe('back');
		expect(parseCommand('repetir', 'es')).toBe('repeat');
		expect(parseCommand('següent', 'ca')).toBe('next');
		expect(parseCommand('enrere', 'ca')).toBe('back');
		expect(parseCommand('Дальше', 'ru')).toBe('next');
		expect(parseCommand('назад', 'ru')).toBe('back');
		expect(parseCommand('повтори', 'ru')).toBe('repeat');
	});

	it('returns null when no command word is in the phrase', () => {
		expect(parseCommand('add more salt', 'en')).toBeNull();
		expect(parseCommand('', 'en')).toBeNull();
	});

	it('does not match a command word inside a longer word', () => {
		expect(parseCommand('nextdoor', 'en')).toBeNull();
	});

	it('uses only the words of the given language', () => {
		expect(parseCommand('next', 'ru')).toBeNull();
	});
});
