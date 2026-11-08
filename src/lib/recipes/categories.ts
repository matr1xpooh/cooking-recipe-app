import { m } from '#lib/paraglide/messages.js';
import { CATEGORIES, type Category } from './recipe';

/** The translated name of a category. */
export function categoryLabel(category: Category): string {
	const labels: Record<Category, () => string> = {
		meat: () => m.category_meat(),
		poultry: () => m.category_poultry(),
		fish: () => m.category_fish(),
		vegetarian: () => m.category_vegetarian(),
		soup: () => m.category_soup(),
		dessert: () => m.category_dessert(),
		baking: () => m.category_baking(),
		drinks: () => m.category_drinks(),
		other: () => m.category_other()
	};
	return labels[category]();
}

export { CATEGORIES };
