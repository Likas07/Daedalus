<script lang="ts">
	import type { AppEvent } from "@daedalus-pi/app-server-protocol";
	import type { ComposerSubmitInput } from "../../client/composer-state";
	import type { ProjectionThreadStore } from "../../client/projection-runtime";
	import type { GuiRuntime, GuiState, SessionSummary } from "../../client/runtime";
	import type { UiState } from "../../client/ui-state.svelte";
	import MessagesTimeline from "../messages/MessagesTimeline.svelte";
	import ThreadComposer from "./ThreadComposer.svelte";
	import ThreadHeader from "./ThreadHeader.svelte";
	import ThreadInspector from "./ThreadInspector.svelte";
	import ThreadSidebar from "./ThreadSidebar.svelte";

	const { guiState, runtime, ui } = $props<{ guiState: GuiState; runtime: GuiRuntime; ui: UiState }>();
	const shell = $derived(guiState.projections?.shell ?? { threads: [], safetySignals: [] });
	const thread = $derived(guiState.projections?.thread as ProjectionThreadStore | undefined);
	const selectedSession = $derived(guiState.sessions.find((session: SessionSummary) => session.id === guiState.selectedSessionId));
	const activeTurnId = $derived(findActiveTurnId(guiState.events, thread?.sessionId ?? guiState.selectedSessionId));
	const continueDisabled = $derived(getContinueDisabledReason(selectedSession, activeTurnId));
	const targetValidation = $derived(selectedSession?.runsIn?.validationStatus ?? selectedSession?.validationStatus ?? "valid");
	const dirtyTarget = $derived(selectedSession?.runsIn?.dirty === true);
	const disabledReason = $derived(!guiState.selectedSessionId ? "Select a Thread before replying." : undefined);

	async function selectThread(threadId: string): Promise<void> {
		await runtime.selectSession(threadId);
	}

	async function sendFollowUp(input: ComposerSubmitInput): Promise<void> {
		const sessionId = thread?.sessionId ?? guiState.selectedSessionId;
		if (!sessionId) throw new Error("Select a Thread before sending a follow-up.");
		await runtime.startTurn({ ...input, sessionId });
	}

	async function cancelTurn(): Promise<void> {
		const sessionId = thread?.sessionId ?? guiState.selectedSessionId;
		if (!sessionId || !activeTurnId) return;
		await runtime.cancelTurn(sessionId, activeTurnId);
	}

	async function stopThread(): Promise<void> {
		const sessionId = thread?.sessionId ?? guiState.selectedSessionId;
		if (!sessionId) return;
		await runtime.stopSession(sessionId);
	}

	async function continueInWorktree(): Promise<void> {
		if (!selectedSession || continueDisabled || !runtime.continueInWorktree) return;
		await runtime.continueInWorktree({
			sourceSessionId: selectedSession.id,
			projectId: selectedSession.projectId ?? selectedSession.runsIn?.projectId,
		});
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

	function getContinueDisabledReason(session: SessionSummary | undefined, runningTurnId: string | undefined): string | undefined {
		if (!session) return "Select a Thread first.";
		if (runningTurnId || session.activeTurnId || session.status === "running") return "Wait for the active source turn to finish.";
		if (session.archived || session.status === "archived") return "Archived source Threads cannot continue in a worktree.";
		if (session.status === "unavailable") return "Source Thread is unavailable.";
		if (!session.runsIn) return "Source Thread has no persisted workspace target.";
		if (session.runsIn.validationStatus && session.runsIn.validationStatus !== "valid") return session.runsIn.reason ?? "Resolve the source target before continuing in a worktree.";
		return undefined;
	}
</script>

<section class="thread-workspace" data-testid="thread-workspace" data-component="thread-workspace">
	{#if ui.leftOpen}
		<div class="thread-workspace__sidebar"><ThreadSidebar {shell} onSelectThread={selectThread} /></div>
	{/if}

	<div class="thread-workspace__main" data-component="chat-view">
		<ThreadHeader
			{thread}
			{activeTurnId}
			accessMode={guiState.accessMode}
			{targetValidation}
			{dirtyTarget}
			connectionState={guiState.connectionStatus}
			onCancelTurn={cancelTurn}
			onStop={stopThread}
			onContinueInWorktree={continueInWorktree}
		/>

		<div class="thread-workspace__timeline" data-testid="thread-messages-surface">
			{#if guiState.selectedSessionId && !thread}
				<div class="thread-workspace__state" role="status">Loading Thread projection…</div>
			{:else if !guiState.selectedSessionId}
				<div class="thread-workspace__state">Select a Thread to start messaging.</div>
			{:else}
				<MessagesTimeline rows={thread?.rows ?? []} />
			{/if}
		</div>

		<footer class="thread-workspace__composer" data-component="thread-composer-slot">
			<ThreadComposer {guiState} {runtime} {ui} {thread} disabled={Boolean(disabledReason)} {disabledReason} onSubmit={sendFollowUp} />
		</footer>
	</div>

	{#if ui.rightOpen}
		<div class="thread-workspace__inspector"><ThreadInspector {thread} {targetValidation} accessMode={guiState.accessMode} {dirtyTarget} connectionState={guiState.connectionStatus} /></div>
	{/if}
</section>
