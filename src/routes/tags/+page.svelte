<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import { tagLabel } from '#lib/recipes/tags.js';
	import { isBuiltInTag, TAGS } from '#lib/recipes/recipe.js';
	import type { GlossaryRule } from '#lib/recipes/glossary.js';
	import { deleteGlossaryRule, fetchGlossary } from '#lib/recipes/recipe-api.js';
	import { forgetGlossary } from '#lib/recipes/display.js';

	onMount(() => {
		recipeStore.load();
		loadFixes();
	});

	/** Translation fixes, shown below the tags. */
	let fixes = $state<GlossaryRule[]>([]);

	async function loadFixes() {
		try {
			fixes = await fetchGlossary();
		} catch {
			fixes = [];
		}
	}

	async function removeFix(rule: GlossaryRule) {
		error = null;
		try {
			await deleteGlossaryRule(rule.id);
			forgetGlossary();
			await loadFixes();
		} catch {
			error = m.error_save_failed();
		}
	}

	let error = $state<string | null>(null);
	let busy = $state(false);

	/** Every tag in use, with how many recipes have it. Built-in tags come first. */
	const tags = $derived(
		[...new Set(recipeStore.recipes.flatMap((r) => r.tags))]
			.map((tag) => ({
				tag,
				count: recipeStore.recipes.filter((r) => r.tags.includes(tag)).length
			}))
			.sort((a, b) => {
				const ra = (TAGS as readonly string[]).indexOf(a.tag);
				const rb = (TAGS as readonly string[]).indexOf(b.tag);
				if (ra >= 0 || rb >= 0) return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
				return a.tag.localeCompare(b.tag);
			})
	);

	/** Asks how many recipes will lose the tag, then removes it from them all. */
	async function remove(tag: string, count: number) {
		if (count > 0 && !window.confirm(m.tags_untag_confirm({ n: count, tag }))) return;
		busy = true;
		error = null;
		try {
			await recipeStore.removeTag(tag);
		} catch {
			error = m.error_save_failed();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{m.manage_tags()}</title>
</svelte:head>

<main>
	<p class="back"><a href={resolve('/recipes')}>← {m.recipes_title()}</a></p>
	<h1>{m.manage_tags()}</h1>

	{#if error}
		<p role="alert">{error}</p>
	{/if}

	{#if tags.length === 0}
		<p>{m.tags_none()}</p>
	{:else}
		<div class="tag-list">
			{#each tags as { tag, count } (tag)}
				<span class="tag on">
					{isBuiltInTag(tag) ? tagLabel(tag) : tag}
					<span class="meta-inline">({count})</span>
					<button
						type="button"
						class="tag-remove"
						disabled={busy}
						aria-label={m.tags_delete_label({ tag: isBuiltInTag(tag) ? tagLabel(tag) : tag })}
						onclick={() => remove(tag, count)}>×</button
					>
				</span>
			{/each}
		</div>
	{/if}

	<section class="fixes">
		<h2>{m.glossary_title()}</h2>
		<p class="meta">{m.glossary_hint()}</p>
		{#if fixes.length === 0}
			<p>{m.glossary_empty()}</p>
		{:else}
			<ul class="plain">
				{#each fixes as rule (rule.id)}
					<li>
						{rule.source} → {rule.target}
						<span class="meta"
							>({rule.language}{rule.unit
								? `, ${rule.unit === 'volume' ? m.glossary_unit_volume() : m.glossary_unit_weight()}`
								: ''})</span
						>
						<button
							type="button"
							class="tag-remove"
							aria-label={m.glossary_remove({ from: rule.source })}
							onclick={() => removeFix(rule)}>×</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
