<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { recipeStore } from '#lib/recipes/store.svelte.js';
	import { tagLabel } from '#lib/recipes/tags.js';
	import { isBuiltInTag, TAGS } from '#lib/recipes/recipe.js';

	onMount(() => recipeStore.load());

	let error = $state<string | null>(null);
	let busy = $state(false);
	let newNames = $state<Record<string, string>>({});

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

	async function run(action: () => Promise<void>) {
		busy = true;
		error = null;
		try {
			await action();
		} catch {
			error = m.error_save_failed();
		} finally {
			busy = false;
		}
	}

	function rename(tag: string) {
		const to = newNames[tag] ?? '';
		newNames = { ...newNames, [tag]: '' };
		return run(() => recipeStore.renameTag(tag, to));
	}

	function remove(tag: string, count: number) {
		if (!window.confirm(m.tags_confirm_remove({ tag, n: count }))) return;
		return run(() => recipeStore.removeTag(tag));
	}
</script>

<svelte:head>
	<title>{m.manage_tags()}</title>
</svelte:head>

<main>
	<p class="back"><a href={resolve('/recipes')}>← {m.recipes_title()}</a></p>
	<h1>{m.manage_tags()}</h1>
	<p class="meta">{m.tags_manage_hint()}</p>

	{#if error}
		<p role="alert">{error}</p>
	{/if}

	{#if tags.length === 0}
		<p>{m.tags_none()}</p>
	{:else}
		<ul class="tag-manage">
			{#each tags as { tag, count } (tag)}
				<li>
					<div class="tag-line">
						<span class="tag on">{isBuiltInTag(tag) ? tagLabel(tag) : tag}</span>
						<span class="meta">{count}</span>
						<button
							type="button"
							class="link-button danger"
							disabled={busy}
							onclick={() => remove(tag, count)}>{m.tags_remove_all()}</button
						>
					</div>
					<div class="tag-rename">
						<input
							type="text"
							placeholder={m.tags_rename_placeholder()}
							aria-label={m.tags_rename_placeholder()}
							bind:value={newNames[tag]}
						/>
						<button type="button" class="link-button" disabled={busy} onclick={() => rename(tag)}
							>{m.tags_rename()}</button
						>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>
