<script lang="ts">
	import type { WorkflowChangedFile } from "@daedalus-pi/app-server-protocol";
	import { buildDaedalusWorkflowViewModel, workflowFromTypedEvents } from "../client/daedalus-workflow-view-model";
	import type { GuiState } from "../client/runtime";
	import type { UiState } from "../client/ui-state.svelte";
	import ApprovalQueue from "./ApprovalQueue.svelte";

	type Section = "plan" | "approvals" | "diff";

	const { guiState, respondToApproval, ui } = $props<{
		guiState: GuiState;
		respondToApproval: (approvalId: string, decision: "approved" | "denied") => void;
		ui: UiState;
	}>();

	let open = $state<Record<Section, boolean>>({ plan: true, approvals: true, diff: true });
	let diffExpanded = $state(false);
	const DIFF_COLLAPSED_LIMIT = 6;

	const diffFiles = $derived<readonly WorkflowChangedFile[]>(guiState.activeDiff?.files ?? []);
	const diffVisible = $derived<readonly WorkflowChangedFile[]>(
		diffExpanded ? diffFiles : diffFiles.slice(0, DIFF_COLLAPSED_LIMIT),
	);
	const diffOverflow = $derived(Math.max(0, diffFiles.length - DIFF_COLLAPSED_LIMIT));
	const eventWorkflow = $derived(workflowFromTypedEvents(guiState.events));
	const workflow = $derived(eventWorkflow?.sessionId === guiState.selectedSessionId ? eventWorkflow : undefined);
	const workflowView = $derived(workflow ? buildDaedalusWorkflowViewModel(workflow) : undefined);
	const activePlan = $derived(workflow?.plans.at(-1));

	const counts = $derived<Record<Section, string>>({
		plan: workflowView ? workflowView.workflow.todos.length.toString() : "0",
		approvals: guiState.approvalItems.length.toString().padStart(2, "0"),
		diff: `${diffFiles.length}`,
	});

	function toggle(section: Section): void {
		open[section] = !open[section];
	}
</script>

{#snippet sectionHeader(section: Section, label: string)}
	<button
		type="button"
		onclick={() => toggle(section)}
		aria-expanded={open[section]}
		class="group flex w-full items-center justify-between py-3 text-left transition hover:text-bone-50"
	>
		<span class="caps text-bone-300 group-hover:text-bone-100">{label}</span>
		<span class="flex items-center gap-3">
			<span class="font-mono text-[10px] text-bone-400">{counts[section]}</span>
			<span class="inline-block w-2 text-center font-mono text-[11px] leading-none text-bone-400 transition-transform duration-150 {open[section] ? 'rotate-90' : ''}" aria-hidden="true">›</span>
		</span>
	</button>
{/snippet}

<aside class="flex h-full min-h-0 flex-col overflow-y-auto px-6 text-[12.5px]" data-testid="inspector">
	<section class="border-b border-ink-500">
		{@render sectionHeader("plan", "plan")}
		{#if open.plan}
			{#if workflow && workflowView}
				<div class="space-y-3 pb-4 text-bone-200">
					<div>
						<div class="truncate text-[13px] font-medium text-bone-50" title={activePlan?.title ?? "Plan"}>{activePlan?.title ?? "Plan"}</div>
						<div class="mt-1 font-mono text-[10px] text-bone-400">{activePlan?.status ?? "captured"} · {workflowView.todoSummary}</div>
					</div>
					<ul class="space-y-2">
						{#each workflow.todos as todo (todo.id)}
							<li class="border-l border-ink-500 pl-2">
								<div class="flex items-baseline justify-between gap-2">
									<span class="truncate text-[12px] text-bone-100" title={todo.title}>{todo.title}</span>
									<span class="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-bone-400">{todo.status.replaceAll("_", " ")}</span>
								</div>
								{#if todo.summary}
									<div class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-bone-400">{todo.summary}</div>
								{/if}
							</li>
						{:else}
							<li class="font-mono text-[10px] text-bone-400">No todos captured.</li>
						{/each}
					</ul>
				</div>
			{:else}
				<div class="pb-4 text-bone-200">No active plan selected.</div>
			{/if}
		{/if}
	</section>

	<section class="border-b border-ink-500">
		{@render sectionHeader("approvals", "approvals")}
		{#if open.approvals}
			<div class="pb-4">
				<ApprovalQueue approvals={guiState.approvalItems} respond={(approval, decision) => respondToApproval(approval.id, decision)} />
			</div>
		{/if}
	</section>

	<section>
		{@render sectionHeader("diff", "diff")}
		{#if open.diff}
			<ul class="space-y-1 pb-2">
				{#each diffVisible as file (file.path)}
					{@const basename = file.path.split("/").at(-1) ?? file.path}
					{@const dir = file.path.slice(0, file.path.length - basename.length).replace(/\/$/, "")}
					<li>
						<button
							type="button"
							onclick={() => (ui.diffPath = file.path)}
							class="group flex w-full items-baseline justify-between gap-4 py-1 text-left font-mono text-[11px] transition hover:text-bone-50"
							title={file.path}
						>
							<div class="min-w-0">
								<div class="truncate text-bone-100 group-hover:text-gold">{basename}</div>
								<div class="truncate text-[10px] text-bone-400">{dir || file.status}</div>
							</div>
							<span class="shrink-0 tabular-nums text-bone-300">
								+{file.insertions} &nbsp;−{file.deletions}
							</span>
						</button>
					</li>
				{:else}
					<li class="font-mono text-[10px] text-bone-400">No changes detected.</li>
				{/each}
			</ul>
			{#if diffOverflow > 0}
				<button
					type="button"
					onclick={() => (diffExpanded = !diffExpanded)}
					class="mb-4 caps text-bone-400 transition hover:text-bone-100"
				>
					{diffExpanded ? "show less" : `show ${diffOverflow} more`}
				</button>
			{/if}
		{/if}
	</section>
</aside>
