<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import { isLanguage } from '#lib/recipes/languages.js';
	import { translateTitles } from '#lib/recipes/translate-client.js';
	import { translationCache } from '#lib/recipes/translation-cache.js';
	import { CATEGORIES, categoryLabel } from '#lib/recipes/categories.js';
	import type { Category } from '#lib/recipes/recipe.js';
	import { SvelteSet } from 'svelte/reactivity';

	onMount(() => recipeStore.load());

	// The site language is set by a page reload, so it is read once per page view.
	const locale = getLocale();
	let titles = $state<Record<string, string>>({});

	// Translate every title in one batch; titles that fail show the original.
	$effect(() => {
		const list = recipeStore.recipes;
		if (list.length === 0 || !isLanguage(locale)) return;
		translateTitles(list, locale, translationCache).then((map) => {
			titles = map;
		});
	});

	let view = $state<'recipes' | 'archive'>('recipes');
	let filter = $state<Category | 'all'>('all');
	const selected = new SvelteSet<string>();
	let busy = $state(false);
	let actionError = $state<string | null>(null);

	const inView = $derived(recipeStore.recipes.filter((r) => r.archived === (view === 'archive')));

	/** Categories present in the current view, with how many recipes each has. */
	const counts = $derived(
		CATEGORIES.map((c) => ({
			category: c,
			count: inView.filter((r) => r.category === c).length
		})).filter((c) => c.count > 0)
	);

	const visible = $derived(inView.filter((r) => filter === 'all' || r.category === filter));

	function setView(next: 'recipes' | 'archive') {
		view = next;
		filter = 'all';
		selected.clear();
		actionError = null;
	}

	function toggle(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}

	function selectAllVisible() {
		selected.clear();
		for (const r of visible) selected.add(r.id);
	}

	async function run(action: () => Promise<void>) {
		busy = true;
		actionError = null;
		try {
			await action();
			selected.clear();
		} catch {
			actionError = m.error_save_failed();
		} finally {
			busy = false;
		}
	}

	const ids = () => [...selected];

	function archiveSelected() {
		return run(() => recipeStore.setArchived(ids(), true));
	}

	function restoreSelected() {
		return run(() => recipeStore.setArchived(ids(), false));
	}

	function deleteSelected() {
		const n = selected.size;
		if (!window.confirm(m.delete_confirm({ n }))) return;
		return run(() => recipeStore.remove(ids()));
	}
</script>

<svelte:head>
	<title>{m.recipes_title()}</title>
</svelte:head>

<main>
	<header>
		<h1>{m.recipes_title()}</h1>
		<a href={resolve('/recipes/new')}>{m.recipes_add()}</a>
	</header>

	{#if recipeStore.loadError}
		<p role="alert">{m.error_load_failed()}</p>
	{/if}

	<div class="tabs" role="tablist" aria-label={m.recipes_title()}>
		<button
			type="button"
			role="tab"
			class="tab"
			class:active={view === 'recipes'}
			aria-selected={view === 'recipes'}
			onclick={() => setView('recipes')}>{m.recipes_view()}</button
		>
		<button
			type="button"
			role="tab"
			class="tab"
			class:active={view === 'archive'}
			aria-selected={view === 'archive'}
			onclick={() => setView('archive')}>{m.archive_view()}</button
		>
	</div>

	{#if counts.length > 0}
		<div class="chips" role="group" aria-label={m.recipe_field_category()}>
			<button
				type="button"
				class="chip"
				class:active={filter === 'all'}
				onclick={() => (filter = 'all')}>{m.category_all()} ({inView.length})</button
			>
			{#each counts as { category, count } (category)}
				<button
					type="button"
					class="chip"
					class:active={filter === category}
					onclick={() => (filter = category)}>{categoryLabel(category)} ({count})</button
				>
			{/each}
		</div>
	{/if}

	{#if view === 'archive'}
		<p class="meta">{m.archive_note()}</p>
	{/if}

	{#if visible.length > 0}
		<div class="bulk-bar">
			<button type="button" class="link-button" onclick={selectAllVisible}>{m.select_all()}</button>
			{#if selected.size > 0}
				<span>{m.selected_count({ n: selected.size })}</span>
				{#if view === 'recipes'}
					<button type="button" class="chip" disabled={busy} onclick={archiveSelected}
						>{m.archive_action()}</button
					>
				{:else}
					<button type="button" class="chip" disabled={busy} onclick={restoreSelected}
						>{m.restore_action()}</button
					>
					<button type="button" class="chip danger" disabled={busy} onclick={deleteSelected}
						>{m.delete_action()}</button
					>
				{/if}
			{/if}
		</div>
	{/if}

	{#if actionError}
		<p role="alert">{actionError}</p>
	{/if}

	{#if visible.length === 0}
		<p>{view === 'archive' ? m.archive_empty() : m.recipes_empty()}</p>
	{:else}
		<ul>
			{#each visible as recipe (recipe.id)}
				<li class="recipe-row">
					<input
						type="checkbox"
						class="select"
						checked={selected.has(recipe.id)}
						onchange={() => toggle(recipe.id)}
						aria-label={recipe.title}
					/>
					<a class="card-link" href={resolve('/recipes/[id]', { id: recipe.id })}>
						<strong>{titles[recipe.id] ?? recipe.title}</strong>
					</a>
					<span class="meta">{categoryLabel(recipe.category)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</main>
