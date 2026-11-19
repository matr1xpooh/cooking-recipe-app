<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import { loadDisplay, shownFields } from '#lib/recipes/display.js';
	import { isLanguage } from '#lib/recipes/languages.js';
	import {
		buildShoppingList,
		formatAmounts,
		shoppingToText,
		type AmountUnits,
		type ShoppingItem
	} from '#lib/recipes/shopping.js';
	import {
		clearShoppingList,
		readShoppingList,
		removeFromShoppingList,
		writeShoppingList
	} from '#lib/recipes/shopping-store.js';

	let ids = $state<string[]>([]);
	let have = $state<string[]>([]);
	let items = $state<ShoppingItem[]>([]);
	let notTranslated = $state<string[]>([]);
	let loading = $state(true);
	let message = $state<'copied' | 'failed' | null>(null);

	function units(): AmountUnits {
		return { g: m.unit_g(), kg: m.unit_kg(), ml: m.unit_ml(), l: m.unit_l(), pcs: m.unit_pcs() };
	}

	/** Reads the chosen recipes, in the site language when there is one, and adds them up. */
	async function build(): Promise<void> {
		loading = true;
		await recipeStore.load();
		const lang = getLocale();
		const lists: { id: string; title: string; lines: string[] }[] = [];
		const failed: string[] = [];
		for (const id of ids) {
			const recipe = recipeStore.recipes.find((r) => r.id === id);
			if (!recipe) continue;
			let fields;
			if (isLanguage(lang)) {
				const { translated, override } = await loadDisplay(recipe, lang, true);
				fields = shownFields(recipe, translated, override);
				if (translated?.failed) failed.push(recipe.title);
			} else {
				fields = shownFields(recipe, null, null);
			}
			lists.push({ id, title: fields.title, lines: fields.ingredients });
		}
		items = buildShoppingList(lists);
		notTranslated = failed;
		loading = false;
	}

	onMount(() => {
		const saved = readShoppingList();
		ids = saved.ids;
		have = saved.have;
		void build();
	});

	function toggle(key: string): void {
		have = have.includes(key) ? have.filter((k) => k !== key) : [...have, key];
		writeShoppingList({ ids, have });
	}

	function clearTicks(): void {
		have = [];
		writeShoppingList({ ids, have });
	}

	/** Takes one recipe off the list and rebuilds the totals from the rest. */
	function removeRecipe(id: string): void {
		ids = removeFromShoppingList(id).ids;
		void build();
	}

	function clearList(): void {
		const saved = clearShoppingList();
		ids = saved.ids;
		have = saved.have;
		items = [];
		notTranslated = [];
	}

	/** The recipes on the list, for the chips at the top. Ones that no longer exist are left out. */
	const listed = $derived(
		ids.map((id) => recipeStore.recipes.find((r) => r.id === id)).filter((r) => r !== undefined)
	);

	/* Ticked items stay where they are, crossed out, so they can be unticked. */
	const toBuy = $derived(items.filter((i) => !i.toTaste));
	const asNeeded = $derived(items.filter((i) => i.toTaste));

	async function share(): Promise<void> {
		message = null;
		const text = shoppingToText(items, have, units(), { asNeeded: m.shopping_as_needed() });
		try {
			if (navigator.share) {
				await navigator.share({ title: m.shopping_title(), text });
				return;
			}
			await navigator.clipboard.writeText(text);
			message = 'copied';
		} catch (error) {
			// Closing the share sheet is not an error.
			if (!(error instanceof DOMException && error.name === 'AbortError')) message = 'failed';
		}
	}
</script>

<svelte:head>
	<title>{m.shopping_title()}</title>
</svelte:head>

{#snippet row(item: ShoppingItem)}
	<li class:done={have.includes(item.key)}>
		<label class="shop-row">
			<input
				type="checkbox"
				checked={have.includes(item.key)}
				aria-label={m.shopping_have()}
				onchange={() => toggle(item.key)}
			/>
			<span class="shop-name">{item.name}</span>
			{#if !item.toTaste}
				<span class="shop-amount">{formatAmounts(item.amounts, units())}</span>
			{/if}
		</label>
		<small class="shop-from">
			{item.from.map((f) => `${f.title}: ${f.line}`).join(' · ')}
		</small>
	</li>
{/snippet}

<main>
	<header class="list-header">
		<h1>{m.shopping_title()}</h1>
	</header>

	{#if loading}
		<p role="status">{m.shopping_loading()}</p>
	{:else if ids.length === 0}
		<p>
			{m.shopping_empty()} <a href={resolve('/recipes')}>{m.recipes_title()}</a>
		</p>
	{:else}
		{#if listed.length > 0}
			<ul class="listed">
				{#each listed as recipe (recipe.id)}
					<li>
						<span>{recipe.title}</span>
						<button
							type="button"
							class="link-button"
							aria-label={m.shopping_remove_recipe({ title: recipe.title })}
							onclick={() => removeRecipe(recipe.id)}>×</button
						>
					</li>
				{/each}
			</ul>
			<p class="shop-actions">
				<button type="button" class="link-button danger" onclick={clearList}
					>{m.shopping_clear_list()}</button
				>
			</p>
		{/if}

		{#if notTranslated.length > 0}
			<p class="meta">{m.shopping_not_translated()} {notTranslated.join(', ')}</p>
		{/if}

		{#if toBuy.length === 0 && asNeeded.length === 0}
			<p>{m.shopping_nothing()}</p>
		{/if}

		{#if toBuy.length > 0}
			<ul class="shop-list">
				{#each toBuy as item (item.key)}{@render row(item)}{/each}
			</ul>
		{/if}

		{#if asNeeded.length > 0}
			<h2>{m.shopping_as_needed()}</h2>
			<ul class="shop-list">
				{#each asNeeded as item (item.key)}{@render row(item)}{/each}
			</ul>
		{/if}

		<p class="shop-actions">
			<button type="button" onclick={share}>{m.shopping_share()}</button>
			{#if have.length > 0}
				<button type="button" class="link-button" onclick={clearTicks}>{m.shopping_clear()}</button>
			{/if}
		</p>
		{#if message === 'copied'}
			<p role="status">{m.share_copied()}</p>
		{:else if message === 'failed'}
			<p role="alert">{m.share_failed()}</p>
		{/if}
	{/if}
</main>

<style>
	/* The recipes on the list, as chips with a remove button */
	.listed {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0 0 0.6rem;
	}

	.listed li {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--control-border);
		border-radius: 999px;
		background: none;
	}

	.shop-list {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
	}

	/* Plain rows, not the recipe-card look that the global list items have */
	.shop-list li,
	.shop-list li:hover {
		display: block;
		padding: 0.5rem 0;
		background: none;
		border: none;
		border-bottom: 1px solid currentColor;
		border-radius: 0;
	}

	.shop-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 2.5rem;
	}

	/* The global input rule makes every input full width and 44px tall */
	.shop-row input[type='checkbox'] {
		flex: none;
		width: 1.4rem;
		height: 1.4rem;
		min-height: 0;
		margin: 0;
		padding: 0;
	}

	.shop-name {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	/* A ticked item is crossed out; unticking it brings it back */
	.shop-list li.done .shop-name,
	.shop-list li.done .shop-amount {
		text-decoration: line-through;
		opacity: 0.55;
	}

	.shop-amount {
		font-weight: 700;
		white-space: nowrap;
	}

	.shop-from {
		display: block;
		padding-left: 2rem;
		opacity: 0.75;
	}

	.shop-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.8rem;
	}
</style>
