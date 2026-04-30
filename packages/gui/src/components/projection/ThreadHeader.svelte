<script lang="ts">
	import type { ProjectionThreadStore } from "../../client/projection-runtime";
	import ProjectionStatusPills from "./ProjectionStatusPills.svelte";
	import SafetySignalStrip from "./SafetySignalStrip.svelte";

	const { thread, activeTurnId, accessMode = "ask", targetValidation = "valid", dirtyTarget = false, connectionState = "connected", onCancelTurn, onStop, onContinueInWorktree } = $props<{
		thread?: ProjectionThreadStore;
		activeTurnId?: string;
		accessMode?: string;
		targetValidation?: string;
		dirtyTarget?: boolean;
		connectionState?: string;
		onCancelTurn?: () => void | Promise<void>;
		onStop?: () => void | Promise<void>;
		onContinueInWorktree?: () => void | Promise<void>;
	}>();

	const pendingApprovalCount = $derived(thread?.pendingActions.filter((action: import("@daedalus-pi/app-server-protocol").ThreadPendingAction) => action.kind === "approval").length ?? 0);
</script>

<header class="flex shrink-0 items-start justify-between gap-4 border-b border-ink-500 px-5 py-3" aria-label="Active Thread header">
	<div class="min-w-0 flex-1 space-y-2">
		<div class="flex min-w-0 items-center gap-3">
			<h1 class="truncate text-[16px] font-medium leading-tight tracking-[-0.01em] text-bone-50">{thread?.title ?? "Thread"}</h1>
			<ProjectionStatusPills status={thread?.status} worktreeId={thread?.worktreeId} projectId={thread?.projectId} {accessMode} safetySignals={thread?.safetySignals ?? []} pendingActionCount={pendingApprovalCount} />
		</div>
		<SafetySignalStrip {targetValidation} {accessMode} {dirtyTarget} pendingApprovals={pendingApprovalCount} {connectionState} signals={thread?.safetySignals ?? []} />
	</div>
	<div class="flex shrink-0 items-center gap-2 caps" aria-label="Thread actions">
		<button type="button" class="rounded-sm border border-ink-500 px-2 py-1 text-bone-300 transition hover:bg-ink-850 hover:text-bone-100 disabled:opacity-40" disabled={!activeTurnId} onclick={() => onCancelTurn?.()} aria-label="Cancel active turn">cancel turn</button>
		<button type="button" class="rounded-sm border border-ink-500 px-2 py-1 text-bone-300 transition hover:bg-ink-850 hover:text-bone-100 disabled:opacity-40" disabled={!thread} onclick={() => onStop?.()} aria-label="Stop Thread">stop</button>
		<button type="button" class="rounded-sm border border-ink-500 px-2 py-1 text-bone-300 transition hover:bg-ink-850 hover:text-bone-100 disabled:opacity-40" disabled={!thread} onclick={() => onContinueInWorktree?.()} aria-label="Continue Thread in Worktree">continue in worktree</button>
	</div>
</header>
