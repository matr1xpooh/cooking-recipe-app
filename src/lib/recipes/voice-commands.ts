import type { Language } from './languages.js';

/** Commands the cook can say while a recipe is open in cooking mode. */
export type VoiceCommand = 'next' | 'back' | 'repeat';

const COMMANDS: VoiceCommand[] = ['next', 'back', 'repeat'];

/**
 * The words that trigger each command, in each interface language. Accented and plain
 * spellings are both listed, since speech recognition may return either.
 */
const WORDS: Record<Language, Record<VoiceCommand, string[]>> = {
	en: { next: ['next'], back: ['back'], repeat: ['repeat'] },
	es: { next: ['siguiente'], back: ['atrás', 'atras'], repeat: ['repetir'] },
	ca: { next: ['següent', 'seguent'], back: ['enrere'], repeat: ['repeteix', 'repetir'] },
	ru: { next: ['далее', 'дальше'], back: ['назад'], repeat: ['повтори', 'повторить'] }
};

/** The speech recognition and speech synthesis language for each interface language. */
export const SPEECH_LANGUAGE: Record<Language, string> = {
	en: 'en-US',
	es: 'es-ES',
	ca: 'ca-ES',
	ru: 'ru-RU'
};

/** The command a phrase says, if it contains one of the command words. */
export function parseCommand(transcript: string, lang: Language): VoiceCommand | null {
	const words = transcript
		.toLowerCase()
		.split(/[^\p{L}]+/u)
		.filter((w) => w.length > 0);
	for (const command of COMMANDS) {
		if (WORDS[lang][command].some((word) => words.includes(word))) return command;
	}
	return null;
}

// Browser speech support. Chrome on Android has it; many iPhone browsers do not.

interface RecognitionResult {
	readonly length: number;
	readonly [index: number]: { readonly transcript: string };
}

interface RecognitionEvent {
	readonly resultIndex: number;
	readonly results: ArrayLike<RecognitionResult>;
}

interface RecognitionLike {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onresult: ((event: RecognitionEvent) => void) | null;
	onend: (() => void) | null;
	onerror: ((event: { error: string }) => void) | null;
	start(): void;
	stop(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
	if (typeof window === 'undefined') return null;
	const w = window as unknown as {
		SpeechRecognition?: RecognitionConstructor;
		webkitSpeechRecognition?: RecognitionConstructor;
	};
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True when this browser can listen for voice commands. */
export function voiceSupported(): boolean {
	return recognitionConstructor() !== null;
}

/**
 * Listens for commands until the returned function is called. The browser stops listening
 * after silence, so it is restarted while the listener is still wanted.
 */
export function startListening(
	lang: Language,
	onCommand: (command: VoiceCommand) => void
): () => void {
	const Recognition = recognitionConstructor();
	if (!Recognition) return () => {};

	const recognition = new Recognition();
	recognition.lang = SPEECH_LANGUAGE[lang];
	recognition.continuous = true;
	recognition.interimResults = false;
	let wanted = true;

	recognition.onresult = (event) => {
		for (let i = event.resultIndex; i < event.results.length; i++) {
			const command = parseCommand(event.results[i][0].transcript, lang);
			if (command) onCommand(command);
		}
	};
	recognition.onend = () => {
		if (!wanted) return;
		try {
			recognition.start();
		} catch {
			wanted = false;
		}
	};
	recognition.onerror = (event) => {
		// Permission refused or no speech service: stop trying.
		if (event.error === 'not-allowed' || event.error === 'service-not-allowed') wanted = false;
	};

	try {
		recognition.start();
	} catch {
		wanted = false;
	}
	return () => {
		wanted = false;
		recognition.stop();
	};
}

/** Reads text aloud when the browser can. */
export function speak(text: string, lang: Language): void {
	if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
	window.speechSynthesis.cancel();
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.lang = SPEECH_LANGUAGE[lang];
	window.speechSynthesis.speak(utterance);
}
