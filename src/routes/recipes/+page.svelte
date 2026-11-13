<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import { isLanguage } from '#lib/recipes/languages.js';
	import { translateTitles } from '#lib/recipes/translate-client.js';
	import { translationCache } from '#lib/recipes/translation-cache.js';
	import { TagNames } from '#lib/recipes/tag-names.svelte.js';
	import { matchesName } from '#lib/recipes/recipe.js';
	import { TAGS, type Tag } from '#lib/recipes/recipe.js';
	import { loadImage } from '#lib/recipes/image-store.js';
	import { SvelteSet } from 'svelte/reactivity';
	import LanguageSwitcher from '#lib/LanguageSwitcher.svelte';
	import SignOutButton from '#lib/SignOutButton.svelte';

	onMount(() => recipeStore.load());

	/** Each card shows the recipe's first photo. Loaded once per recipe, released when the page closes. */
	let thumbs = $state<Record<string, string>>({});
	const thumbRequested = new SvelteSet<string>();
	const thumbUrls: string[] = [];

	$effect(() => {
		for (const recipe of visible) {
			const first = recipe.images[0];
			if (!first || thumbRequested.has(recipe.id)) continue;
			thumbRequested.add(recipe.id);
			loadImage(recipe.id, first)
				.then((blob) => {
					if (!blob) return;
					const url = URL.createObjectURL(blob);
					thumbUrls.push(url);
					thumbs = { ...thumbs, [recipe.id]: url };
				})
				.catch(() => {});
		}
	});

	onDestroy(() => thumbUrls.forEach((url) => URL.revokeObjectURL(url)));

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

	const tagNames = new TagNames();

	$effect(() => {
		tagNames.ensure(recipeStore.recipes.flatMap((r) => r.tags));
	});

	let view = $state<'recipes' | 'archive'>('recipes');
	/** Tags to filter by. A recipe must have all of them to be listed. */
	const filters = new SvelteSet<Tag>();
	/** Checkboxes only appear in selection mode. */
	let selecting = $state(false);
	const selected = new SvelteSet<string>();
	let busy = $state(false);
	let actionError = $state<string | null>(null);

	const inView = $derived(recipeStore.recipes.filter((r) => r.archived === (view === 'archive')));

	/** Tags used in the current view, with how many recipes in it have each. */
	const counts = $derived(
		[...new Set(inView.flatMap((r) => r.tags))]
			.sort((a, b) => {
				const rank = (t: string) => (TAGS as readonly string[]).indexOf(t);
				const ra = rank(a);
				const rb = rank(b);
				if (ra >= 0 || rb >= 0) return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
				return a.localeCompare(b);
			})
			.map((tag) => ({ tag, count: inView.filter((r) => r.tags.includes(tag)).length }))
	);

	let query = $state('');
	/** The tag filters are folded away until the user opens them. */
	let filtersOpen = $state(false);

	/** Recipes matching the view, the selected tags and the name search. */
	const visible = $derived(
		inView.filter(
			(r) =>
				[...filters].every((tag) => r.tags.includes(tag)) &&
				matchesName([r.title, titles[r.id] ?? ''], query)
		)
	);

	function setView(next: 'recipes' | 'archive') {
		view = next;
		filters.clear();
		selecting = false;
		selected.clear();
		actionError = null;
	}

	function toggleFilter(tag: Tag) {
		if (filters.has(tag)) filters.delete(tag);
		else filters.add(tag);
	}

	function toggleSelecting() {
		selecting = !selecting;
		if (!selecting) selected.clear();
	}

	function toggle(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}

	function selectAllVisible() {
		selected.clear();
		for (const r of visible) selected.add(r.id);
	}

	function deselectAll() {
		selected.clear();
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
	<header class="list-header">
		<h1>{m.recipes_title()}</h1>
		<div class="list-tools">
			<LanguageSwitcher />
		</div>
		<div class="list-links">
			{#if page.data.signedIn}
				<a class="header-link" href={resolve('/recipes/new')} aria-label={m.recipes_add()}
					>{m.add_recipe_short()}</a
				>
				<a class="header-link" href={resolve('/tags')} aria-label={m.manage_tags()}
					>{m.tags_short()}</a
				>
			{/if}
			{#if page.data.showSignOut}
				<span class="sign-out-slot">
					<SignOutButton />
				</span>
			{:else if !page.data.signedIn}
				<a
					class="icon-link"
					href={resolve('/signin')}
					aria-label={m.signin_button()}
					title={m.signin_button()}
				>
					<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
						<path
							fill="currentColor"
							d="M11 7 9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z"
						/>
					</svg>
				</a>
			{/if}
		</div>
	</header>

	{#if recipeStore.loadError}
		<p role="alert">{m.error_load_failed()}</p>
	{/if}

	{#if page.data.signedIn}
		<div class="tabs" role="tablist" aria-label={m.recipes_title()}>
			<button
				type="button"
				role="tab"
				class="tab"
				class:active={view === 'recipes'}
				aria-selected={view === 'recipes'}
				onclick={() => setView('recipes')}>{m.view_active()}</button
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
	{/if}

	<div class="search">
		<input
			type="search"
			bind:value={query}
			placeholder={m.search_placeholder()}
			aria-label={m.search_placeholder()}
		/>
	</div>

	<div class="filter-row">
		{#if counts.length > 0}
			<button
				type="button"
				class="chip"
				aria-expanded={filtersOpen}
				aria-controls="tag-filters"
				onclick={() => (filtersOpen = !filtersOpen)}
				>{m.filters_toggle()}{filters.size > 0 ? ` (${filters.size})` : ''}
				{filtersOpen ? '▴' : '▾'}</button
			>
		{/if}
		{#if visible.length > 0 && page.data.signedIn}
			<button
				type="button"
				class="chip select-chip"
				aria-pressed={selecting}
				onclick={toggleSelecting}>{selecting ? m.select_done() : m.select_mode()}</button
			>
		{/if}
	</div>

	{#if filtersOpen && counts.length > 0}
		<div id="tag-filters" class="chips" role="group" aria-label={m.recipe_field_tags()}>
			<button
				type="button"
				class="chip"
				class:active={filters.size === 0}
				aria-pressed={filters.size === 0}
				onclick={() => filters.clear()}>{m.category_all()} ({inView.length})</button
			>
			{#each counts as { tag, count } (tag)}
				<button
					type="button"
					class="chip"
					class:active={filters.has(tag)}
					aria-pressed={filters.has(tag)}
					onclick={() => toggleFilter(tag)}>{tagNames.label(tag)} ({count})</button
				>
			{/each}
		</div>
	{/if}

	{#if view === 'archive'}
		<p class="meta">{m.archive_note()}</p>
	{/if}

	{#if selecting && visible.length > 0 && page.data.signedIn}
		<div class="bulk-bar">
			<button type="button" class="link-button" onclick={selectAllVisible}>{m.select_all()}</button>
			<button type="button" class="link-button" onclick={deselectAll}>{m.deselect_all()}</button>
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
		<p>
			{#if query.trim().length > 0}
				{m.search_none({ query })}
			{:else if filters.size > 0}
				{m.tags_none()}
			{:else}
				{view === 'archive' ? m.archive_empty() : m.recipes_empty()}
			{/if}
		</p>
	{:else}
		<ul>
			{#each visible as recipe (recipe.id)}
				<li class="recipe-row" class:selecting>
					{#if selecting}
						<input
							type="checkbox"
							class="select"
							checked={selected.has(recipe.id)}
							onchange={() => toggle(recipe.id)}
							aria-label={recipe.title}
						/>
					{/if}
					<a class="card-link" href={resolve('/recipes/[id]', { id: recipe.id })}>
						{#if thumbs[recipe.id]}
							<img class="thumb" src={thumbs[recipe.id]} alt="" />
						{/if}
						<strong>{titles[recipe.id] ?? recipe.title}</strong>
					</a>
					<span class="meta">{recipe.tags.map((t) => tagNames.label(t)).join(', ')}</span>
				</li>
			{/each}
		</ul>
	{/if}
</main>
