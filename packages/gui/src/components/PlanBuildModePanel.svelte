<script lang="ts">
	import type { DaedalusAutonomyMode, DaedalusPlanState } from "@daedalus-pi/app-server-protocol";
	const { mode = "build", plans = [], todoSummary } = $props<{ mode?: DaedalusAutonomyMode; plans?: readonly DaedalusPlanState[]; todoSummary?: string }>();
	const modes: Array<{ id: DaedalusAutonomyMode; label: string; gloss: string }> = [
		{ id: "plan", label: "Plan", gloss: "draft only" },
		{ id: "build", label: "Build", gloss: "execute with approvals" },
		{ id: "yolo", label: "Yolo", gloss: "no rails" },
	];
</script>

<section class="rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-2)] p-3">
	<header class="flex items-baseline justify-between">
		<div class="flex items-baseline gap-2">
			<span class="eyebrow eyebrow-brass">autonomy</span>
			<span class="font-display text-[14px] italic text-[color:var(--bone)]">{mode}</span>
		</div>
		<span class="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--bone-faint)]">daedalus mode</span>
	</header>
	<div class="mt-2 grid grid-cols-3 gap-1">
		{#each modes as item}
			<div class="rounded-sm border px-2 py-1.5 text-center transition" class:border-[color:var(--brass-rule)]={mode === item.id} class:bg-[color:var(--brass-glow)]={mode === item.id} class:border-[color:var(--rule)]={mode !== item.id} class:bg-transparent={mode !== item.id}>
				<div class="font-mono text-[10.5px] uppercase tracking-[0.06em]" class:text-[color:var(--brass-hi)]={mode === item.id} class:text-[color:var(--bone-muted)]={mode !== item.id}>{item.label}</div>
				<div class="mt-0.5 font-display text-[10px] italic text-[color:var(--bone-faint)]">{item.gloss}</div>
			</div>
		{/each}
	</div>
	{#if plans.length || todoSummary}
		<div class="mt-2 space-y-1 font-mono text-[10px] text-[color:var(--bone-faint)]">
			{#each plans as plan}
				<p><span class="uppercase tracking-[0.14em]">plan</span> <span class="text-[color:var(--bone-soft)]">{plan.title}</span> · {plan.status}</p>
			{/each}
			{#if todoSummary}<p><span class="uppercase tracking-[0.14em]">todos</span> {todoSummary}</p>{/if}
		</div>
	{/if}
</section>
