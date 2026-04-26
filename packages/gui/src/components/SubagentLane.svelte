<script lang="ts">
	import type { OrchestrationLane } from "@daedalus-pi/app-server-protocol";
	const { lane } = $props<{ lane: OrchestrationLane }>();

	function statusToneClass(status: string): string {
		if (status === "running" || status === "active") return "pill pill-blue";
		if (status === "blocked" || status === "waiting") return "pill pill-ember";
		if (status === "failed" || status === "error") return "pill pill-crimson";
		if (status === "completed" || status === "done") return "pill pill-green";
		return "pill";
	}
</script>

<div class="inspector-card" data-testid="subagent-lane">
	<div class="inspector-card-title">
		<span class="flex items-center gap-2">
			<span aria-hidden="true" class="font-display text-[14px] italic text-[color:var(--brass)]">⌬</span>
			<span>{lane.title}</span>
		</span>
		<span class={statusToneClass(lane.status)}>{lane.status}</span>
	</div>
	<p class="inspector-card-meta">{lane.summary || lane.kind}</p>
	{#if lane.dependencies.length}
		<p class="font-mono text-[10px] text-[color:var(--bone-faint)]">
			<span class="uppercase tracking-[0.14em]">depends on</span>
			<span class="ml-1.5 text-[color:var(--bone-soft)]">{lane.dependencies.join(", ")}</span>
		</p>
	{/if}
	{#if lane.blockedBy?.length}
		<p class="font-mono text-[10px] text-[color:var(--ember)]">
			<span class="uppercase tracking-[0.14em]">blocked by</span>
			<span class="ml-1.5">{lane.blockedBy.join(", ")}</span>
		</p>
	{/if}
	{#if lane.artifacts.length > 0}
		<div class="mt-1 flex flex-wrap gap-1">
			{#each lane.artifacts as artifact}
				<span class="context-chip">
					<span class="context-chip-key">art</span>
					<span class="context-chip-val">{artifact.label}</span>
				</span>
			{/each}
		</div>
	{/if}
</div>
