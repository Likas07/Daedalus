<script lang="ts">
	import type { WorkflowWorktreeMetadata } from "@daedalus-pi/app-server-protocol";
	import type { ComposerSubmitInput } from "../client/composer-state";
	import type { GuiRuntime, GuiState, SessionSummary } from "../client/runtime";
	import { createProjectDashboardViewModel } from "../client/project-dashboard-view-model";
	import ChangesPanel from "./ChangesPanel.svelte";
	import WorktreePanel from "./WorktreePanel.svelte";
	import TaskComposer from "./TaskComposer.svelte";
	import BuildTargetTrustBar from "./BuildTargetTrustBar.svelte";
	import NeedsAttentionRecovery from "./NeedsAttentionRecovery.svelte";
	import CloseoutReceipt from "./CloseoutReceipt.svelte";

	const { guiState, runtime, ui } = $props<{ guiState: GuiState; runtime: GuiRuntime; ui: import("../client/ui-state.svelte").UiState }>();
	let query = $state("");
	const filteredSessions = $derived(
		guiState.sessions.filter((session: SessionSummary) =>
			`${session.title} ${session.id}`.toLowerCase().includes(query.trim().toLowerCase()),
		),
	);
	const projectDraftKey = $derived(`daedalus.gui.draft.project:${guiState.projectRoot ?? "new"}`);
	const dashboard = $derived(createProjectDashboardViewModel(guiState));

	const projectLabel = $derived(dashboard.projectPath ?? "Choose a workspace");
	const projectShortName = $derived(dashboard.projectName);
	const selectedSession = $derived(guiState.sessions.find((session: SessionSummary) => session.id === guiState.selectedSessionId) ?? dashboard.activeSessions[0]);
	let showCloseout = $state(true);

	async function startFromComposer(input: ComposerSubmitInput): Promise<void> {
		await runtime.startSessionFromPrompt({
			...input,
			path: input.path ?? guiState.projectRoot ?? "",
			projectId: input.projectId ?? guiState.lastProjectId,
			worktreeId: input.worktreeId ?? dashboard.activeWorktree?.id,
		});
	}

	async function createWorktree(): Promise<void> {
		if (!guiState.lastProjectId) return;
		const branch = globalThis.prompt?.("New worktree branch name")?.trim();
		if (!branch) return;
		await runtime.createWorktree({ projectId: guiState.lastProjectId, branch });
	}

	async function openInEditor(): Promise<void> {
		if (!dashboard.openInEditor.enabled) return;
		await runtime.openInEditor(dashboard.openInEditor.path);
	}

	function selectWorktree(id: string): void {
		const worktree = guiState.worktrees.find((item: WorkflowWorktreeMetadata) => String(item.id) === id);
		if (!worktree) return;
		guiState.projectRoot = worktree.path;
		void runtime.refreshDiff(id);
	}

	function statusToneClass(status: string): string {
		if (status === "running" || status === "active") return "pill pill-blue";
		if (status === "waiting" || status === "waiting_for_approval") return "pill pill-ember";
		if (status === "failed" || status === "error") return "pill pill-crimson";
		if (status === "completed" || status === "done") return "pill pill-green";
		return "pill";
	}
</script>

<section class="project-canvas relative flex h-full min-h-0 flex-col surface-canvas">
	<header class="relative px-8 pt-7 pb-5 draft-rise">
		<div class="flex items-start justify-between gap-6">
			<div class="min-w-0">
				<div class="flex items-center gap-3">
					<span class="eyebrow eyebrow-brass">project · cockpit</span>
					<span aria-hidden="true" class="h-px w-10 bg-[color:var(--rule-strong)]"></span>
					<span class="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--bone-faint)]">
						drafting room
					</span>
				</div>
				<h1 class="mt-3 flex flex-wrap items-baseline gap-x-4">
					<span class="font-display text-[44px] italic leading-[1.05] text-[color:var(--bone)]">
						Atelier
					</span>
					<span class="font-mono text-[16px] text-[color:var(--bone-soft)]">/ {projectShortName}</span>
				</h1>
				<p class="mt-2 max-w-xl text-[13.5px] leading-relaxed text-[color:var(--bone-soft)]">
					A quiet ledger of sessions, worktrees, branches, and pending diffs.
					<span class="font-display italic text-[color:var(--bone)]">Begin a task below.</span>
				</p>
				<p class="mt-1 font-mono text-[11px] text-[color:var(--bone-faint)]">{projectLabel}</p>
			</div>
			<div class="flex shrink-0 flex-col items-end gap-2">
				<button class="btn-ghost" type="button" disabled={!dashboard.openInEditor.enabled} title={dashboard.openInEditor.reason ?? dashboard.openInEditor.path} onclick={openInEditor}>↗ Open in editor</button>
				<div class="flex gap-1">
					<span class="pill"><span class="text-[color:var(--bone-faint)]">{dashboard.branchLabel}</span></span>
					<span class="pill tnum"><span class="text-[color:var(--bone-faint)]">+</span><span class="text-[color:var(--diff-add)]">{dashboard.git.insertions}</span><span class="text-[color:var(--bone-faint)]">·</span><span class="text-[color:var(--diff-rm)]">{dashboard.git.deletions}</span></span>
				</div>
			</div>
		</div>

		<div class="mt-6 flex max-w-2xl items-center gap-2">
			<label class="sr-only" for="project-search">Search sessions and worktrees</label>
			<div class="relative flex-1">
				<span aria-hidden="true" class="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[color:var(--bone-faint)]">⌕</span>
				<input
					id="project-search"
					name="projectSearch"
					class="field pl-8"
					bind:value={query}
					placeholder="Search sessions, branches, or worktrees…"
				/>
			</div>
			<kbd class="kbd hidden md:inline-flex">⌘K · Index</kbd>
		</div>
	</header>

	<!-- ruled separator with tick marks -->
	<div class="px-8" aria-hidden="true">
		<div class="relative h-px bg-[color:var(--rule)]">
			<span class="absolute -top-1 left-0 h-2 w-px bg-[color:var(--rule-strong)]"></span>
			<span class="absolute -top-1 left-1/4 h-1.5 w-px bg-[color:var(--rule-strong)]"></span>
			<span class="absolute -top-1 left-1/2 h-2 w-px bg-[color:var(--brass-rule)]"></span>
			<span class="absolute -top-1 left-3/4 h-1.5 w-px bg-[color:var(--rule-strong)]"></span>
			<span class="absolute -top-1 right-0 h-2 w-px bg-[color:var(--rule-strong)]"></span>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-auto px-8 py-6 pb-44 bg-grid">
		{#if selectedSession?.runsIn}
			<div class="mb-4 draft-rise draft-rise-1">
				<BuildTargetTrustBar runsIn={selectedSession.runsIn} nextAction={selectedSession.bestNextAction} />
				<NeedsAttentionRecovery session={selectedSession} blocking={selectedSession.validationStatus !== "valid"} />
			</div>
		{/if}
		<div class="mb-6 grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] draft-rise draft-rise-2">
			<WorktreePanel worktrees={dashboard.worktrees} selectedWorktreeId={dashboard.activeWorktree?.id ? String(dashboard.activeWorktree.id) : undefined} onCreate={createWorktree} onSelect={selectWorktree} />
			<ChangesPanel git={dashboard.activeDiff ?? { branch: dashboard.branchLabel === "detached" ? null : dashboard.branchLabel, upstream: dashboard.upstreamLabel === "no upstream" ? null : dashboard.upstreamLabel, ahead: dashboard.git.ahead, behind: dashboard.git.behind, stagedCount: dashboard.git.stagedCount, unstagedCount: dashboard.git.unstagedCount, files: [] }} />
		</div>

		{#if showCloseout}
			<div class="mb-6 draft-rise draft-rise-3">
				<CloseoutReceipt files={dashboard.activeDiff?.files ?? []} terminals={guiState.terminals} approvals={guiState.approvalItems.length} errors={guiState.diagnostics.map((item: import("../client/gui-state-types").RendererDiagnostic) => item.message)} worktreePath={selectedSession?.runsIn?.path ?? dashboard.activeWorktree?.path ?? dashboard.projectPath} branch={selectedSession?.runsIn?.branch ?? dashboard.branchLabel} onOpenInEditor={openInEditor} onContinue={() => { showCloseout = false; }} onClose={() => { showCloseout = false; }} />
			</div>
		{/if}

		<div class="mb-3 flex items-baseline justify-between">
			<h2 class="flex items-baseline gap-3">
				<span class="font-display text-[22px] italic text-[color:var(--bone)]">Sessions</span>
				<span class="eyebrow">active · {dashboard.activeSessions.length} · approvals {dashboard.approvalCount} · terms {dashboard.terminalCount}</span>
			</h2>
			<span class="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--bone-faint)]">
				{filteredSessions.length} of {guiState.sessions.length}
			</span>
		</div>

		{#if guiState.sessions.length === 0}
			<div class="hatch corner-crops grid min-h-[18rem] place-items-center rounded-md border border-dashed border-[color:var(--rule)] bg-[color:var(--ink-2)]/40 text-center">
				<div class="max-w-md px-8">
					<div class="mx-auto grid size-14 place-items-center rounded-md border border-[color:var(--brass-rule)] bg-[color:var(--brass-glow)] font-display text-[28px] italic text-[color:var(--brass-hi)] mark-pulse">
						Δ
					</div>
					<h3 class="mt-5 font-display text-[24px] italic text-[color:var(--bone)]">
						Begin with a central task
					</h3>
					<p class="mt-2 text-[13px] leading-6 text-[color:var(--bone-soft)]">
						Describe the work below. Daedalus will open the project if needed and stamp the
						first session into the ledger — without filling the drawer with chrome.
					</p>
					<div class="mt-5 flex flex-wrap justify-center gap-1.5">
						<span class="pill">⌘K — Index</span>
						<span class="pill">⌘↵ — Submit</span>
						<span class="pill">⎋ — Dismiss</span>
					</div>
				</div>
			</div>
		{:else}
			<div class="space-y-1.5">
				{#each filteredSessions as session, idx}
					<button
						class="group grid w-full grid-cols-[auto_minmax(0,1fr)_180px_160px_auto] items-center gap-5 rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-2)] px-5 py-3.5 text-left transition hover:border-[color:var(--brass-rule)] hover:bg-[color:var(--ink-3)]"
						onclick={() => runtime.selectSession(session.id)}
					>
						<span class="font-mono text-[10px] tabular-nums text-[color:var(--bone-faint)] tracking-wider">
							{(idx + 1).toString().padStart(3, "0")}
						</span>
						<div class="min-w-0">
							<p class="truncate text-[14px] font-medium text-[color:var(--bone)]">{session.title}</p>
							<p class="mt-1 truncate font-mono text-[11px] text-[color:var(--bone-faint)]">{session.id}</p>
						</div>
						<div>
							<div class="eyebrow">branch</div>
							<div class="mt-0.5 font-mono text-[12px] text-[color:var(--bone-soft)]">{dashboard.branchLabel}</div>
						</div>
						<div>
							<div class="eyebrow">diff</div>
							<div class="mt-0.5 font-mono text-[12px] tabular-nums text-[color:var(--bone-soft)]">
								<span class="text-[color:var(--diff-add)]">+{dashboard.git.insertions}</span>
								<span class="mx-1 text-[color:var(--bone-faint)]">·</span>
								<span class="text-[color:var(--diff-rm)]">−{dashboard.git.deletions}</span>
							</div>
						</div>
						<span class={statusToneClass(session.status)}>{session.status}</span>
					</button>
				{:else}
					<p class="hatch rounded-md border border-dashed border-[color:var(--rule)] p-6 text-center font-display text-[15px] italic text-[color:var(--bone-soft)]">
						No rows match "{query}".
					</p>
				{/each}
			</div>
		{/if}
	</div>

	<!-- composer floats over the cockpit -->
	<div class="pointer-events-none sticky bottom-0 px-8 pb-6">
		<div class="pointer-events-auto mx-auto max-w-3xl">
			<TaskComposer
				guiState={guiState}
				{runtime}
				{ui}
				projectPath={guiState.projectRoot}
				storageKey={projectDraftKey}
				requireProjectPath={!guiState.projectRoot}
				submitLabel="Start session"
				onSubmit={startFromComposer}
			/>
		</div>
	</div>
</section>
