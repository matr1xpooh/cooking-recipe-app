import { m } from '#lib/paraglide/messages.js';
import { TAGS, type Tag } from './recipe';

/** The translated name of a tag. */
export function tagLabel(tag: Tag): string {
	const labels: Record<Tag, () => string> = {
		meat: () => m.category_meat(),
		poultry: () => m.category_poultry(),
		fish: () => m.category_fish(),
		vegetarian: () => m.category_vegetarian(),
		soup: () => m.category_soup(),
		dessert: () => m.category_dessert(),
		baking: () => m.category_baking(),
		drinks: () => m.category_drinks()
	};
	return labels[tag]();
}

export { TAGS };
