export interface Recipe {
	id: string;
	title: string;
	/** External video or webpage URL, or null when none was given. */
	sourceUrl: string | null;
	ingredients: string[];
	/** One step per item. Steps may contain the styling markup (see notes.ts). */
	steps: string[];
	/**
	 * Notes from before the notes field was removed. Shown read-only on the detail
	 * page; new recipes always store an empty string.
	 */
	notes: string;
	createdAt: string;
	archived: boolean;
}

/** Raw values as typed in the add-recipe form. Lists are one item per line. */
export interface RecipeInput {
	title: string;
	sourceUrl: string;
	ingredients: string;
	steps: string;
}

export type RecipeField = 'title' | 'sourceUrl';

export type RecipeErrors = Partial<Record<RecipeField, RecipeErrorKey>>;

export type RecipeErrorKey = 'title_required' | 'source_url_invalid';

/** Splits multi-line form text into trimmed, non-empty items. */
export function parseLines(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

export function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

export function validateRecipeInput(input: RecipeInput): RecipeErrors {
	const errors: RecipeErrors = {};
	if (input.title.trim().length === 0) {
		errors.title = 'title_required';
	}
	const sourceUrl = input.sourceUrl.trim();
	if (sourceUrl.length > 0 && !isHttpUrl(sourceUrl)) {
		errors.sourceUrl = 'source_url_invalid';
	}
	return errors;
}

export function hasErrors(errors: RecipeErrors): boolean {
	return Object.keys(errors).length > 0;
}

/** Builds a Recipe from valid input. Callers should run validateRecipeInput first. */
export function createRecipe(input: RecipeInput, options: { id: string; createdAt: Date }): Recipe {
	const sourceUrl = input.sourceUrl.trim();
	return {
		id: options.id,
		title: input.title.trim(),
		sourceUrl: sourceUrl.length > 0 ? sourceUrl : null,
		ingredients: parseLines(input.ingredients),
		steps: parseLines(input.steps),
		notes: '',
		createdAt: options.createdAt.toISOString(),
		archived: false
	};
}
