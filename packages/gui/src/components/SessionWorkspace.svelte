<script lang="ts">
	import type { AppEvent } from "@daedalus-pi/app-server-protocol";
	import type { ComposerSubmitInput } from "../client/composer-state";
	import { createThreadTabsViewModel, type ApprovalItem } from "../client/view-model";
	import type { GuiState, SessionSummary } from "../client/runtime";
	import BuildTargetTrustBar from "./BuildTargetTrustBar.svelte";
	import PlanBuildModePanel from "./PlanBuildModePanel.svelte";
	import TaskComposer from "./TaskComposer.svelte";
	import TranscriptTimeline from "./TranscriptTimeline.svelte";

	const { guiState, runtime, ui } = $props<{ guiState: GuiState; runtime: import("../client/runtime").GuiRuntime; ui: import("../client/ui-state.svelte").UiState }>();
	const autonomyMode = $derived(
		guiState.events.findLast((event: AppEvent) => event.type.includes("mode") && typeof event.payload === "object")
			?.payload as { mode?: "plan" | "build" | "yolo" } | undefined,
	);
	const sessionDraftKey = $derived(`daedalus.gui.draft.session:${guiState.selectedSessionId ?? "unknown"}`);
	const selectedSession = $derived(
		guiState.sessions.find((session: SessionSummary) => session.id === guiState.selectedSessionId),
	);
	const threadTabs = $derived(createThreadTabsViewModel(guiState));
	const branchLabel = $derived(selectedSession?.runsIn?.branch ?? selectedSession?.branch ?? threadTabs.branchLabel);
	const activeTurnId = $derived(findActiveTurnId(guiState.events, guiState.selectedSessionId));
	const sessionApprovals = $derived(guiState.approvalItems.filter((approval: ApprovalItem) => !guiState.selectedSessionId || approval.sessionId === guiState.selectedSessionId));

	async function sendFollowUp(input: ComposerSubmitInput): Promise<void> {
		if (!guiState.selectedSessionId) throw new Error("Select a session before sending a follow-up.");
		await runtime.startTurn({ ...input, sessionId: guiState.selectedSessionId });
	}

	async function cancelTurn(): Promise<void> {
		if (!guiState.selectedSessionId || !activeTurnId) return;
		await runtime.cancelTurn(guiState.selectedSessionId, activeTurnId);
	}

	async function stopSession(): Promise<void> {
		if (!guiState.selectedSessionId) return;
		await runtime.stopSession(guiState.selectedSessionId);
	}

	function findActiveTurnId(events: readonly AppEvent[], sessionId?: string): string | undefined {
		for (const event of [...events].reverse()) {
			if (sessionId && event.sessionId !== sessionId) continue;
			const payload = event.payload && typeof event.payload === "object" ? (event.payload as { turnId?: unknown; id?: unknown; status?: unknown }) : undefined;
			const turnId = typeof payload?.turnId === "string" ? payload.turnId : typeof payload?.id === "string" && event.type.includes("turn") ? payload.id : undefined;
			if (!turnId) continue;
			if (event.type.includes("completed") || event.type.includes("cancel") || payload?.status === "completed") return undefined;
			return turnId;
		}
		return undefined;
	}
</script>

<section class="flex h-full min-h-0 flex-col">
	<!-- Title strip -->
	<header class="flex items-start justify-between gap-4 px-10 pb-5 pt-8">
		<div class="min-w-0">
			<h1 class="text-[18px] font-medium leading-tight tracking-[-0.01em] text-bone-50">
				{selectedSession?.title ?? "Session workspace"}
			</h1>
			<p class="mt-1.5 caps text-bone-400">Thread · {branchLabel}</p>
		</div>
		<div class="flex shrink-0 items-center gap-2 caps">
			<span class="text-bone-400">{selectedSession?.status ?? "idle"}</span>
			<button
				type="button"
				class="rounded-sm border border-ink-500 px-2 py-1 text-bone-300 transition hover:bg-ink-850 hover:text-bone-100 disabled:opacity-40"
				disabled={!activeTurnId}
				onclick={cancelTurn}
			>cancel turn</button>
			<button
				type="button"
				class="rounded-sm border border-ink-500 px-2 py-1 text-bone-300 transition hover:bg-ink-850 hover:text-bone-100 disabled:opacity-40"
				disabled={!guiState.selectedSessionId}
				onclick={stopSession}
			>stop session</button>
		</div>
	</header>

	{#if selectedSession?.runsIn}
		<div class="px-10 pb-3">
			<BuildTargetTrustBar runsIn={selectedSession.runsIn} nextAction={selectedSession.bestNextAction} />
		</div>
	{/if}

	<div class="px-10 pb-3">
		<div class="flex flex-wrap items-center gap-2 rounded-sm border border-ink-500 px-3 py-2 font-mono text-[10.5px] text-bone-400">
			<span class="caps text-bone-300">{threadTabs.targetLabel}</span>
			<span>{threadTabs.tabs.length} thread{threadTabs.tabs.length === 1 ? "" : "s"}</span>
			<span>·</span>
			<span>{threadTabs.attentionCount} need attention</span>
			{#if selectedSession?.latestMessage}
				<span class="min-w-[12ch] flex-1 truncate text-bone-300">Latest: {selectedSession.latestMessage}</span>
			{/if}
			{#if selectedSession?.needsAttentionReason}
				<span class="text-gold">Needs attention: {selectedSession.needsAttentionReason}</span>
			{/if}
		</div>
	</div>

	<div class="px-10 pb-3">
		<PlanBuildModePanel mode={autonomyMode?.mode ?? "build"} />
	</div>

	{#if guiState.accessMode === "unrestricted" || sessionApprovals.length > 0}
		<div class="px-10 pb-3 font-mono text-[10.5px] text-bone-400">
			{#if guiState.accessMode === "unrestricted"}
				<p class="text-gold">Unrestricted · audited · hard blocks remain</p>
			{/if}
			{#if sessionApprovals.length > 0}
				<p>Approval shortcut: Ctrl+Enter approves focused request once.</p>
			{/if}
		</div>
	{/if}

	<!-- Transcript -->
	<div class="min-h-0 flex-1 overflow-y-auto px-10 pb-6">
		<div class="mx-auto max-w-[68ch]">
			<TranscriptTimeline events={guiState.events} sessionId={guiState.selectedSessionId} />
		</div>
	</div>

	<!-- Composer -->
	<footer class="px-10 pb-4 pt-3">
		<div class="mx-auto max-w-[88ch]">
			<TaskComposer
				{guiState}
				{runtime}
				{ui}
				projectPath={guiState.projectRoot}
				sessionId={guiState.selectedSessionId}
				storageKey={sessionDraftKey}
				submitLabel="Send follow-up"
				onSubmit={sendFollowUp}
			/>
		</div>
	</footer>
</section>
