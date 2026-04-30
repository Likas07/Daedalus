<script lang="ts">
	import type { SafetySignal } from "@daedalus-pi/app-server-protocol";

	const { status = "idle", worktreeId, projectId, accessMode = "ask", safetySignals = [], pendingActionCount = 0 } = $props<{
		status?: string;
		worktreeId?: string;
		projectId?: string;
		accessMode?: string;
		safetySignals?: readonly SafetySignal[];
		pendingActionCount?: number;
	}>();

	const safetyLevel = $derived(safetySignals.some((signal: SafetySignal) => signal.level === "blocked") ? "blocked" : safetySignals.some((signal: SafetySignal) => signal.level === "warning") ? "warning" : "clear");
	const locationLabel = $derived(worktreeId ? `Worktree ${worktreeId}` : projectId ? `Project ${projectId}` : "No target selected");
</script>

<div class="flex flex-wrap items-center gap-1.5" aria-label="Thread status summary">
	<span class="pill {status === 'running' ? 'pill-blue' : status === 'failed' ? 'pill-crimson' : status === 'completed' ? 'pill-green' : ''}" aria-label={`Thread status: ${status}`}>
		{status}
	</span>
	<span class="pill" aria-label={`Thread location: ${locationLabel}`} title={locationLabel}>
		{worktreeId ? "worktree" : projectId ? "project" : "no target"}
	</span>
	<span class="pill {safetyLevel === 'blocked' ? 'pill-crimson' : safetyLevel === 'warning' ? 'pill-ember' : 'pill-green'}" aria-label={`Access mode ${accessMode}; safety ${safetyLevel}`}>
		{accessMode} · {safetyLevel}
	</span>
	<span class="pill {pendingActionCount > 0 ? 'pill-ember' : ''}" aria-label={`${pendingActionCount} approvals pending`}>
		approvals <span class="tnum">{pendingActionCount}</span>
	</span>
</div>
