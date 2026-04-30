<script lang="ts">
	import type { AppEvent } from "@daedalus-pi/app-server-protocol";
	import { transcriptItemsFromEvents, type TranscriptItem } from "../client/view-model";
	import TranscriptEvent from "./TranscriptEvent.svelte";

	const { events, sessionId } = $props<{ events: readonly AppEvent[]; sessionId?: string }>();
	let scrollContainer: HTMLDivElement | undefined;
	let wasAtBottom = true;
	let lastLiveId: string | undefined;
	const filters: Array<{ type: TranscriptItem["type"]; label: string; glyph: string }> = [
		{ type: "message", label: "Messages", glyph: "¶" },
		{ type: "tool", label: "Tools", glyph: "⌬" },
		{ type: "approval", label: "Approvals", glyph: "◆" },
		{ type: "diff", label: "Diffs", glyph: "±" },
		{ type: "terminal", label: "Terminal", glyph: "▤" },
		{ type: "error", label: "Errors", glyph: "!" },
		{ type: "debug", label: "Debug", glyph: "·" },
	];
	let enabled = $state<Record<TranscriptItem["type"], boolean>>({
		message: true,
		tool: true,
		approval: true,
		diff: true,
		terminal: true,
		error: true,
		debug: false,
	});
	const items = $derived(
		transcriptItemsFromEvents(events).filter((item) => !sessionId || item.sessionId === sessionId),
	);
	const visibleItems = $derived(items.filter((item) => enabled[item.type]).slice(-160));
	const activeLiveId = $derived(visibleItems.findLast((item) => item.kind === "assistant" || item.kind === "bash" || item.kind === "tool")?.id);

	$effect(() => {
		visibleItems.length;
		const shouldScroll = wasAtBottom || activeLiveId !== lastLiveId;
		lastLiveId = activeLiveId;
		if (shouldScroll) requestAnimationFrame(() => scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight }));
	});
	function rememberScroll(): void {
		if (!scrollContainer) return;
		wasAtBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 24;
	}
</script>

<div class="space-y-4" data-testid="legacy-audit-transcript" aria-label="Legacy audit transcript ledger">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-baseline gap-3">
			<span class="eyebrow eyebrow-brass">transcript · ledger</span>
			<span class="font-display text-[18px] italic text-[color:var(--bone-soft)]">
				{visibleItems.length} <span class="text-[color:var(--bone-faint)]">/ {items.length} entries</span>
			</span>
		</div>
		<div class="flex flex-wrap items-center gap-1.5" aria-label="Audit transcript filters">
			{#each filters as filter}
				<button
					type="button"
					class="filter-chip"
					data-on={enabled[filter.type]}
					onclick={() => (enabled[filter.type] = !enabled[filter.type])}
					aria-pressed={enabled[filter.type]}
				>
					<span aria-hidden="true" class="mr-1 font-display not-italic text-[color:var(--brass)]">{filter.glyph}</span>
					{filter.label}
				</button>
			{/each}
		</div>
	</header>

	<div class="relative max-h-full space-y-2 overflow-y-auto" bind:this={scrollContainer} onscroll={rememberScroll}>
		<!-- vertical drafting rule -->
		{#if visibleItems.length > 0}
			<div aria-hidden="true" class="pointer-events-none absolute left-[7px] top-1 bottom-1 w-px bg-[color:var(--rule)]"></div>
		{/if}

		{#each visibleItems as item, idx (item.id)}
			<div class="relative pl-6">
				<span aria-hidden="true" class="absolute left-0 top-4 flex size-[15px] items-center justify-center">
					<span class="size-[7px] rounded-full bg-[color:var(--brass-rule)] ring-2 ring-[color:var(--paper)]"></span>
				</span>
				<span aria-hidden="true" class="absolute -left-2 top-3 font-mono text-[9px] tracking-widest text-[color:var(--bone-faint)]">
					{(idx + 1).toString().padStart(3, "0")}
				</span>
				<TranscriptEvent {item} />
			</div>
		{:else}
			<div class="hatch corner-crops grid min-h-[18rem] place-items-center rounded-md border border-dashed border-[color:var(--rule)] bg-[color:var(--ink-2)]/40 text-center">
				<div class="max-w-sm px-6">
					<div class="mx-auto grid size-12 place-items-center rounded-md border border-[color:var(--brass-rule)] bg-[color:var(--brass-glow)] font-display text-[22px] italic text-[color:var(--brass-hi)]">
						¶
					</div>
					<h3 class="mt-4 font-display text-[20px] italic text-[color:var(--bone)]">Ready when you are</h3>
					<p class="mt-2 text-[12.5px] leading-6 text-[color:var(--bone-soft)]">
						Messages, tool calls, and approvals stamp themselves here as the agent works.
					</p>
				</div>
			</div>
		{/each}
	</div>
</div>
