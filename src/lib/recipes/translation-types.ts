/** One piece of recipe text. `styled` text uses the bold/italic/colour markup. Shared by client and server. */
export interface TranslateItem {
	text: string;
	styled: boolean;
}

export interface TranslatedItem {
	text: string;
	/** True when Translate failed for this item; `text` is then the original. */
	failed: boolean;
}
