<script lang="ts">
	import type { DaedalusWorkflowState, OrchestrationProjection } from "@daedalus-pi/app-server-protocol";
	import { buildDaedalusWorkflowViewModel } from "../client/daedalus-workflow-view-model";
	import SubagentLane from "./SubagentLane.svelte";
	import PlanBuildModePanel from "./PlanBuildModePanel.svelte";
	const { projection, workflow } = $props<{ projection: OrchestrationProjection; workflow?: DaedalusWorkflowState }>();
	const view = $derived(workflow ? buildDaedalusWorkflowViewModel(workflow) : undefined);
</script>

<section class="space-y-3" data-testid="orchestration-panel">
	<header>
		<h3 class="inspector-heading">Orchestration</h3>
		<p class="font-mono text-[10.5px] text-[color:var(--bone-faint)]">
			plans · todos · subagents · questions · semantic workspace
		</p>
	</header>
	<PlanBuildModePanel mode={projection.mode} plans={workflow?.plans ?? []} todoSummary={view?.todoSummary} />
	{#if view}
		<div class="inspector-card">
			<div class="inspector-card-title"><span>Semantic workspace</span><span class="pill">{workflow?.semanticWorkspace.status}</span></div>
			<p class="inspector-card-meta">{view.semanticSummary}</p>
		</div>
		{#if view.openQuestions.length}
			<div class="space-y-2">
				{#each view.openQuestions as question}
					<div class="inspector-card" data-testid="workflow-question">
						<div class="inspector-card-title"><span>{question.kind}</span><span class="pill pill-ember">{question.status}</span></div>
						<p class="inspector-card-meta">{question.prompt}</p>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
	<div class="space-y-2">
		{#each projection.lanes as lane}
			<SubagentLane {lane} />
		{:else}
			<p class="inspector-empty">No typed orchestration lanes yet.</p>
		{/each}
	</div>
</section>
