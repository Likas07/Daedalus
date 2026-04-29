<script lang="ts">
	import type { GuiRuntime, GuiState, SessionSummary } from "../client/runtime";
	import type { ApprovalItem } from "../client/view-model";

	const { state: guiState, runtime, onOpenSettings } = $props<{
		state: GuiState;
		runtime: GuiRuntime;
		onOpenSettings?: () => void;
	}>();

	function sessionHasApproval(sessionId: string): boolean {
		return guiState.approvalItems.some((approval: ApprovalItem) => approval.sessionId === sessionId);
	}

	function sessionStatusLabel(session: SessionSummary): string {
		return sessionHasApproval(session.id) ? "waiting approval" : session.status;
	}

	function sessionToneClass(session: SessionSummary): string {
		if (sessionHasApproval(session.id)) return "pill pill-ember";
		const s = session.status;
		if (s === "running" || s === "active") return "pill pill-blue";
		if (s === "failed" || s === "error") return "pill pill-crimson";
		if (s === "completed" || s === "done") return "pill pill-green";
		return "pill";
	}
</script>

<aside class="flex h-full min-h-0 flex-col">
	<!-- project overview row -->
	<div class="px-3 pt-4 pb-2">
		<div class="eyebrow eyebrow-brass mb-2 px-1">drawer · 01</div>
		<button
			class="group relative flex w-full items-center justify-between gap-2 rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-2)] px-3 py-2.5 text-left transition hover:border-[color:var(--brass-rule)]"
			onclick={() => void runtime.selectSession(undefined)}
			aria-label={`Project overview, ${guiState.sessions.length} sessions, ${guiState.approvalItems.length} approvals pending`}
		>
			<span class="flex min-w-0 items-center gap-2">
				<span aria-hidden="true" class="font-display text-[18px] italic leading-none text-[color:var(--brass-hi)]">¶</span>
				<span class="sidebar-optional-label truncate text-[13px] font-medium text-[color:var(--bone)]">Project overview</span>
			</span>
			<span class="flex items-center gap-1" aria-live="polite" aria-atomic="true">
				<span class="pill" aria-label={`${guiState.sessions.length} sessions`}>
					<span class="text-[color:var(--bone-faint)]">s</span><span class="tnum">{guiState.sessions.length}</span>
				</span>
				<span
					class="pill {guiState.approvalItems.length > 0 ? 'pill-ember' : ''}"
					aria-label={`${guiState.approvalItems.length} approvals pending`}
				>
					<span class="text-[color:var(--bone-faint)]">a</span><span class="tnum">{guiState.approvalItems.length}</span>
				</span>
			</span>
		</button>
	</div>

	<!-- sessions list -->
	<div class="min-h-0 flex-1 overflow-auto pb-2">
		<div class="nav-section-label sidebar-secondary">
			<span>Sessions</span>
			<span class="ml-auto font-mono text-[10px] not-italic text-[color:var(--bone-faint)]">
				{guiState.sessions.length.toString().padStart(2, "0")}
			</span>
		</div>
		<div>
			{#each guiState.sessions as session, idx}
				<button
					class="nav-row group"
					data-active={guiState.selectedSessionId === session.id}
					onclick={() => void runtime.selectSession(session.id)}
					aria-label={`Open session ${session.title}. Status: ${sessionStatusLabel(session)}`}
				>
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<span class="font-mono text-[10px] tabular-nums text-[color:var(--bone-faint)]">
									{(idx + 1).toString().padStart(2, "0")}
								</span>
								<span class="truncate text-[13px] font-medium text-[color:var(--bone)] group-hover:text-[color:var(--bone)]">
									{session.title}
								</span>
							</div>
							<div class="sidebar-secondary mt-1 flex items-center gap-2 text-[10.5px] text-[color:var(--bone-faint)]">
								<span class="font-mono">{session.id.slice(0, 14)}</span>
								<span aria-hidden="true">·</span>
								<span class="font-mono">diff +0 -0</span>
							</div>
						</div>
						<span class={sessionToneClass(session)} aria-label={`Status: ${sessionStatusLabel(session)}`}>
							Status: {sessionStatusLabel(session)}
						</span>
					</div>
				</button>
			{:else}
				<div class="hatch m-3 rounded-md border border-dashed border-[color:var(--rule)] p-5 text-center">
					<p class="font-display text-[15px] italic text-[color:var(--bone-soft)]">No sessions yet</p>
					<p class="mt-1 font-mono text-[10.5px] tracking-wide text-[color:var(--bone-faint)]">
						app-server events will populate this drawer
					</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- footer actions -->
	<footer class="border-t border-[color:var(--rule)] p-3">
		<div class="grid grid-cols-3 gap-1.5">
			<button class="foot-action" type="button">+ New</button>
			<button class="foot-action" type="button">Archived</button>
			<button class="foot-action" type="button" onclick={() => onOpenSettings?.()}>Settings</button>
		</div>
		<p class="sidebar-footer-note mt-3 flex items-center gap-2 px-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--bone-faint)]">
			<span class="size-1 rounded-full bg-[color:var(--brass)]" aria-hidden="true"></span>
			branch · main · diff idle
		</p>
	</footer>
</aside>
