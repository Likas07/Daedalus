<script lang="ts">
	import type { TranscriptItem } from "../client/view-model";

	const { item } = $props<{ item: TranscriptItem }>();
	let expanded = $state(false);
	let copied = $state(false);

	function toneFor(type: TranscriptItem["type"]): string {
		switch (type) {
			case "tool": return "border-blue-500/20 bg-blue-500/5 text-blue-100";
			case "approval": return "border-amber-500/25 bg-amber-500/10 text-amber-100";
			case "diff": return "border-emerald-500/20 bg-emerald-500/5 text-emerald-100";
			case "terminal": return "border-purple-500/20 bg-purple-500/5 text-purple-100";
			case "error": return "border-red-500/30 bg-red-500/10 text-red-100";
			case "debug": return "border-zinc-700 bg-zinc-950/65 text-zinc-400";
			default: return "border-zinc-800 bg-zinc-900/55 text-zinc-300";
		}
	}
	const tone = $derived(toneFor(item.type));

	async function copyRaw(): Promise<void> {
		const text = JSON.stringify(item.raw, null, 2);
		await navigator.clipboard?.writeText(text).catch(() => undefined);
		copied = true;
		setTimeout(() => (copied = false), 1200);
	}
</script>

<article class={`rounded-xl border p-3 shadow-sm ${tone}`} data-testid="transcript-event" aria-label={`${item.type} transcript event: ${item.title}`}> 
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<div class="flex items-center gap-2">
				<span class="rounded-md border border-current/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-75">{item.type}</span>
				<h3 class="truncate text-sm font-medium">{item.title}</h3>
			</div>
			{#if item.summary}
				<p class="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-zinc-400" style="color: var(--color-transcript-muted);">{item.summary}</p>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-1 text-[10px] text-zinc-500">
			{#if item.timestamp}<time>{new Date(item.timestamp).toLocaleTimeString()}</time>{/if}
			{#if item.expandable}
				<button class="rounded border border-zinc-700 px-1.5 py-0.5 hover:border-zinc-500" type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} raw details for ${item.title}`} onclick={() => (expanded = !expanded)}>{expanded ? "Collapse" : "Expand"}</button>
				<button class="rounded border border-zinc-700 px-1.5 py-0.5 hover:border-zinc-500" type="button" aria-label={`Copy raw JSON for ${item.title}`} onclick={copyRaw}>{copied ? "Copied" : "Copy"}</button>
			{/if}
		</div>
	</div>
	{#if expanded}
		<pre class="mt-3 max-h-56 overflow-auto rounded-lg border border-zinc-800 bg-black/35 p-2 text-[11px] leading-relaxed text-zinc-400" style="color: var(--color-transcript-muted);">{JSON.stringify(item.raw, null, 2)}</pre>
	{/if}
</article>
