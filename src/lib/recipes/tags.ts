import { m } from '#lib/paraglide/messages.js';
import { TAGS, isBuiltInTag, type Tag } from './recipe';

/** The name shown for a tag: translated for built-in tags, as typed otherwise. */
export function tagLabel(tag: Tag): string {
	if (!isBuiltInTag(tag)) return tag;
	const labels: Record<(typeof TAGS)[number], () => string> = {
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
