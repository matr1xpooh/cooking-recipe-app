import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { isLanguage } from '#lib/recipes/languages.js';
import type { GlossaryRule, Measure } from '#lib/recipes/glossary.js';
import { getStore } from '#lib/server/store.js';

const SOURCE = /^\p{L}[\p{L} -]{0,39}$/u;
/** One line of text, up to 60 characters. */
const isTarget = (text: string) =>
	text.length > 0 && text.length <= 60 && ![...text].some((c) => c.charCodeAt(0) < 32);

/** GET /api/glossary -> every translation fix */
export const GET: RequestHandler = async () => json(await getStore().listGlossary());

/** POST /api/glossary  body: { language, source, target, unit? } -> adds a fix */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const source = typeof body?.source === 'string' ? body.source.trim().toLowerCase() : '';
	const target = typeof body?.target === 'string' ? body.target.trim() : '';
	const unit = body?.unit ?? undefined;
	if (
		!isLanguage(body?.language) ||
		!SOURCE.test(source) ||
		!isTarget(target) ||
		(unit !== undefined && unit !== 'volume' && unit !== 'weight')
	) {
		return json({ error: 'glossary_invalid' }, { status: 400 });
	}
	const rule: GlossaryRule = {
		id: randomUUID(),
		language: body.language,
		source,
		target,
		...(unit ? { unit: unit as Measure } : {})
	};
	await getStore().saveGlossaryRule(rule);
	return json(rule, { status: 201 });
};
