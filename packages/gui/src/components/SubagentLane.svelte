<script lang="ts">
	import type { OrchestrationLane } from "@daedalus-pi/app-server-protocol";
	const { lane } = $props<{ lane: OrchestrationLane }>();
</script>
<div class="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3" data-testid="subagent-lane">
	<div class="flex items-center justify-between gap-2"><h4 class="text-sm font-medium text-zinc-100">{lane.title}</h4><span class="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">{lane.status}</span></div>
	<p class="mt-1 text-xs text-zinc-400">{lane.summary || lane.kind}</p>
	{#if lane.dependencies.length}<p class="mt-2 text-[11px] text-zinc-500">Depends on {lane.dependencies.join(", ")}</p>{/if}
	{#if lane.blockedBy?.length}<p class="mt-2 text-[11px] text-amber-300">Blocked by {lane.blockedBy.join(", ")}</p>{/if}
	<div class="mt-2 flex flex-wrap gap-1">{#each lane.artifacts as artifact}<span class="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-cyan-300">{artifact.label}</span>{/each}</div>
</div>
