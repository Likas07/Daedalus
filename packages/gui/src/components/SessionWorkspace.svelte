<script lang="ts">
	import type { AppEvent } from "@daedalus-pi/app-server-protocol";
	import { statusTone, diffSummary } from "../client/view-model";
	import type { GuiState, SessionSummary } from "../client/runtime";
	import TaskComposer from "./TaskComposer.svelte";
	import TranscriptTimeline from "./TranscriptTimeline.svelte";
	import PlanBuildModePanel from "./PlanBuildModePanel.svelte";
	const { state } = $props<{ state: GuiState; runtime: unknown }>();
	const sessionDraftKey = $derived(`daedalus.gui.draft.session:${state.selectedSessionId ?? "unknown"}`);
	const selectedSession = $derived(state.sessions.find((session: SessionSummary) => session.id === state.selectedSessionId));
	const followUpUnavailable = "Follow-up turns are not available in this runtime yet. Your draft will be saved locally.";
	const projectLabel = $derived(state.projectRoot?.split("/").filter(Boolean).at(-1) ?? "Project");
	const worktreeLabel = $derived(state.projectRoot ? "Base" : "Worktree/Base");
	const diff = $derived(diffSummary(state.worktrees ?? []));
	const tone = $derived(statusTone(selectedSession?.status));
	const autonomyMode = $derived(
		state.events.findLast((event: AppEvent) => event.type.includes("mode") && typeof event.payload === "object")?.payload as
			| { mode?: "plan" | "build" | "yolo" }
			| undefined,
	);
</script>

<section class="flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950">
	<div class="border-b border-zinc-800 px-4 py-3">
		<div class="flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="truncate text-[11px] text-zinc-500">{projectLabel} <span class="px-1 text-zinc-700">›</span> {worktreeLabel} <span class="px-1 text-zinc-700">›</span> {selectedSession?.title ?? state.selectedSessionId ?? "Session"}</p>
				<h2 class="mt-1 truncate text-sm font-medium text-zinc-100">{selectedSession?.title ?? "Session workspace"}</h2>
			</div>
			<div class="flex shrink-0 flex-wrap justify-end gap-1.5">
				<span class={`rounded border px-2 py-0.5 text-[11px] ${tone === 'danger' ? 'border-red-500/30 bg-red-500/10 text-red-200' : tone === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : tone === 'info' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200' : 'border-zinc-800 bg-zinc-900 text-zinc-400'}`}>{selectedSession?.status ?? "idle"}</span>
				<span class="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">{state.events.length} events</span>
				<span class="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">Diff {diff.files} files · +{diff.insertions} -{diff.deletions}</span>
			</div>
		</div>
		<div class="mt-3 max-w-md">
			<PlanBuildModePanel mode={autonomyMode?.mode ?? "build"} />
		</div>
	</div>
	<div class="min-h-0 flex-1 overflow-auto px-4 pb-44 pt-4">
		<div class="mx-auto w-full max-w-3xl">
			<TranscriptTimeline events={state.events} sessionId={state.selectedSessionId} />
		</div>
	</div>
	<div class="pointer-events-none sticky bottom-0 px-5 pb-5">
		<div class="pointer-events-auto mx-auto max-w-3xl">
			<TaskComposer projectPath={state.projectRoot} sessionId={state.selectedSessionId} storageKey={sessionDraftKey} disabled={true} disabledReason={followUpUnavailable} submitLabel="Send follow-up" />
		</div>
	</div>
</section>
