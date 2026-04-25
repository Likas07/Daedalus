<script lang="ts">
	import type { OrchestrationProjection } from "@daedalus-pi/app-server-protocol";
	import SubagentLane from "./SubagentLane.svelte";
	import PlanBuildModePanel from "./PlanBuildModePanel.svelte";
	const { projection } = $props<{ projection: OrchestrationProjection }>();
</script>
<section class="space-y-3" data-testid="orchestration-panel">
	<PlanBuildModePanel mode={projection.mode} />
	<div class="space-y-2">{#each projection.lanes as lane}<SubagentLane {lane} />{:else}<p class="rounded border border-zinc-800 p-3 text-xs text-zinc-500">No orchestration lanes yet.</p>{/each}</div>
</section>
