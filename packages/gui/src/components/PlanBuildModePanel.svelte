<script lang="ts">
	import type { DaedalusAutonomyMode } from "@daedalus-pi/app-server-protocol";
	const { mode = "build" } = $props<{ mode?: DaedalusAutonomyMode }>();
	const modes: DaedalusAutonomyMode[] = ["plan", "build", "yolo"];
</script>
<section class="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
	<h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Daedalus autonomy</h3>
	<div class="mt-2 grid grid-cols-3 gap-1 text-xs">{#each modes as item}<span class={`rounded px-2 py-1 text-center ${mode === item ? 'bg-cyan-500/15 text-cyan-200' : 'bg-zinc-900 text-zinc-500'}`}>{item === 'yolo' ? 'Yolo' : item === 'plan' ? 'Plan' : 'Build'}</span>{/each}</div>
	<p class="mt-2 text-[11px] text-zinc-500">Autonomy is separate from provider and model selection.</p>
</section>
