<script lang="ts">
	import type { AppEvent } from "@daedalus-pi/app-server-protocol";
	import { transcriptItemsFromEvents, type TranscriptItem } from "../client/view-model";
	import TranscriptEvent from "./TranscriptEvent.svelte";

	const { events, sessionId } = $props<{ events: readonly AppEvent[]; sessionId?: string }>();
	const filters: Array<{ type: TranscriptItem["type"]; label: string }> = [
		{ type: "message", label: "Messages" },
		{ type: "tool", label: "Tools" },
		{ type: "approval", label: "Approvals" },
		{ type: "diff", label: "Diffs" },
		{ type: "terminal", label: "Terminal" },
		{ type: "error", label: "Errors" },
		{ type: "debug", label: "Debug" },
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
	const items = $derived(transcriptItemsFromEvents(events).filter((item) => !sessionId || item.sessionId === sessionId));
	const visibleItems = $derived(items.filter((item) => enabled[item.type]).slice(-160).reverse());
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center gap-1.5" aria-label="Transcript filters">
		{#each filters as filter}
			<button
				type="button"
				class={`rounded-full border px-2.5 py-1 text-[11px] transition ${enabled[filter.type] ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-zinc-800 bg-zinc-900/50 text-zinc-500'}`}
				onclick={() => (enabled[filter.type] = !enabled[filter.type])}
			>
				{filter.label}
			</button>
		{/each}
	</div>

	<div class="space-y-2">
		{#each visibleItems as item (item.id)}
			<TranscriptEvent {item} />
		{:else}
			<div class="grid h-60 place-items-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/25 text-center">
				<div>
					<p class="text-sm font-medium text-zinc-300">Ready when you are</p>
					<p class="mt-1 text-xs text-zinc-500">Messages and activity will appear here as a compact transcript.</p>
				</div>
			</div>
		{/each}
	</div>
</div>
