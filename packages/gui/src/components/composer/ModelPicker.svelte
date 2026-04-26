<script lang="ts">
	import type { RendererModel } from "../../client/gui-state-types";
	import type { UiState } from "../../client/ui-state.svelte";

	const { models = [], selected, onSelect, ui } = $props<{
		models?: readonly RendererModel[];
		selected?: string;
		onSelect?: (model: string) => void;
		ui: UiState;
	}>();

	type RailId = "favorites" | string;
	const rails = $derived.by((): { id: RailId; label: string; glyph: string }[] => {
		const providerSet = new Set<string>();
		for (const model of models) if (model.provider) providerSet.add(model.provider);
		const providers = [...providerSet].sort();
		const glyphFor = (id: string): string => {
			if (id === "anthropic") return "✦";
			if (id === "openai") return "◎";
			if (id === "google") return "◆";
			const head = id.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
			return head || id.charAt(0).toUpperCase();
		};
		return [
			{ id: "favorites", label: "Favorites", glyph: "★" },
			...providers.map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1), glyph: glyphFor(id) })),
		];
	});

	let selectedRail = $state<RailId>("favorites");
	$effect(() => {
		if (selectedRail === "favorites" && ui.favorites.length === 0 && rails[1]) selectedRail = rails[1].id;
	});
	let query = $state("");
	let highlightedIndex = $state(0);

	const visibleModels = $derived.by((): RendererModel[] => {
		let list: RendererModel[] = [...models];
		if (selectedRail === "favorites") {
			list = list.filter((model) => ui.favorites.includes(model.id));
		} else {
			list = list.filter((model) => model.provider === selectedRail);
		}
		if (query.trim()) {
			const q = query.toLowerCase();
			list = list.filter((model) => (model.label ?? model.id).toLowerCase().includes(q));
		}
		return list;
	});

	$effect(() => {
		void visibleModels;
		highlightedIndex = 0;
	});

	function selectModel(model: RendererModel): void {
		onSelect?.(model.id);
		ui.popoverKind = null;
		ui.popoverAnchor = null;
	}

	function toggleFavorite(modelId: string): void {
		const next = ui.favorites.includes(modelId)
			? ui.favorites.filter((id: string) => id !== modelId)
			: [...ui.favorites, modelId];
		ui.favorites = next;
	}

	function onSearchKey(event: KeyboardEvent): void {
		if (event.key === "ArrowDown") { event.preventDefault(); highlightedIndex = Math.min(highlightedIndex + 1, visibleModels.length - 1); }
		else if (event.key === "ArrowUp") { event.preventDefault(); highlightedIndex = Math.max(highlightedIndex - 1, 0); }
		else if (event.key === "Enter") {
			event.preventDefault();
			const model = visibleModels[highlightedIndex];
			if (model) selectModel(model);
		} else if (event.key === "Escape") {
			event.preventDefault();
			ui.popoverKind = null;
			ui.popoverAnchor = null;
		}
	}
</script>

<div class="flex h-full min-h-0" data-testid="model-picker">
	<div class="flex w-12 shrink-0 flex-col gap-1 overflow-y-auto border-r border-ink-500 bg-ink-950 p-1">
		{#each rails as rail, i}
			<button
				type="button"
				onclick={() => (selectedRail = rail.id)}
				title={rail.label}
				aria-label={rail.label}
				aria-pressed={selectedRail === rail.id}
				class="relative flex aspect-square w-full items-center justify-center rounded-sm transition {selectedRail === rail.id ? 'bg-ink-850 text-bone-50' : 'text-bone-400 hover:bg-ink-850 hover:text-bone-100'}"
			>
				{#if selectedRail === rail.id}
					<span class="absolute right-0 top-1/2 h-4 w-px -translate-y-1/2 bg-gold"></span>
				{/if}
				<span class="text-[14px] {rail.id === 'favorites' && selectedRail === rail.id ? 'text-gold' : ''}">{rail.glyph}</span>
			</button>
			{#if i === 0}<span class="my-0.5 h-px bg-ink-500"></span>{/if}
		{/each}
	</div>

	<div class="flex min-w-0 flex-1 flex-col">
		<div class="border-b border-ink-500 px-3 py-2">
			<div class="flex items-center gap-2 rounded-sm border border-ink-500 bg-ink-950 px-2 py-1">
				<svg viewBox="0 0 16 16" class="h-3 w-3 text-bone-400" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
					<circle cx="7" cy="7" r="4.5" />
					<path d="M10.5 10.5L13 13" stroke-linecap="round" />
				</svg>
				<input
					type="text"
					bind:value={query}
					onkeydown={onSearchKey}
					placeholder="Search models…"
					class="min-w-0 flex-1 bg-transparent text-[12.5px] text-bone-50 placeholder:text-bone-400 focus:outline-none"
				/>
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto py-1">
			{#if visibleModels.length === 0}
				<div class="px-4 py-6 text-center text-[12px] text-bone-400">No models found.</div>
			{:else}
				<ul class="divide-y divide-ink-500">
					{#each visibleModels as model, i}
						{@const fav = ui.favorites.includes(model.id)}
						{@const isSelected = selected === model.id}
						<li>
							<div
								class="group grid grid-cols-[16px_1fr_auto] items-start gap-2 px-3 py-2 transition {highlightedIndex === i ? 'bg-ink-850' : ''} {isSelected ? 'text-bone-50' : 'text-bone-200'}"
								role="button"
								tabindex="0"
								onclick={() => model.available === false ? undefined : selectModel(model)}
								onmouseenter={() => (highlightedIndex = i)}
								onkeydown={(e) => e.key === "Enter" && model.available !== false && selectModel(model)}
							>
								<button
									type="button"
									onclick={(e) => { e.stopPropagation(); toggleFavorite(model.id); }}
									aria-label={fav ? "Unfavorite" : "Favorite"}
									class="mt-0.5 text-[12px] transition {fav ? 'text-gold' : 'text-bone-500 hover:text-bone-200'}"
								>★</button>
								<div class="min-w-0">
									<div class="flex items-center gap-2 text-[12.5px] font-medium {isSelected ? 'text-bone-50' : 'text-bone-100'}">
										<span class="truncate">{model.label ?? model.id}</span>
									</div>
									{#if model.provider}
										<div class="truncate font-mono text-[10px] text-bone-400">{model.provider}</div>
									{#if model.available === false}<div class="truncate font-mono text-[10px] text-bone-500">disabled: provider unavailable</div>{/if}
									{/if}
								</div>
								{#if i < 9}
									<kbd class="mt-0.5 rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[9.5px] tracking-normal text-bone-400">Ctrl+{i + 1}</kbd>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>
