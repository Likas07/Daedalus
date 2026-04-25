<script lang="ts">
	import type { GuiRuntime, GuiState } from "../client/runtime";
	import type { ApprovalItem } from "../client/view-model";
	const { state: guiState, runtime, onOpenSettings } = $props<{ state: GuiState; runtime: GuiRuntime; onOpenSettings?: () => void }>();
	function sessionHasApproval(sessionId: string): boolean {
		return guiState.approvalItems.some((approval: ApprovalItem) => approval.sessionId === sessionId);
	}
</script>

<aside class="flex h-full min-h-0 flex-col bg-zinc-950/70">
	<div class="border-b border-zinc-800 p-3">
		<p class="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Navigation</p>
		<button class="mt-2 flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-2 text-left text-xs hover:border-cyan-700/50" onclick={() => runtime.selectSession(undefined)} aria-label={`Project overview, ${guiState.sessions.length} sessions, ${guiState.approvalItems.length} approvals pending`}> 
			<span class="sidebar-optional-label text-zinc-300">Project overview</span>
			<span class="flex items-center gap-1" aria-live="polite" aria-atomic="true"><span class="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300" aria-label={`${guiState.sessions.length} sessions`}>{guiState.sessions.length}</span><span class="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300" aria-label={`${guiState.approvalItems.length} approvals pending`}>{guiState.approvalItems.length}</span></span>
		</button>
	</div>

	<div class="min-h-0 flex-1 overflow-auto p-2">
		<p class="sidebar-secondary px-2 pb-2 pt-1 text-[10px] uppercase tracking-wider text-zinc-600">Sessions</p>
		<div class="space-y-1">
			{#each guiState.sessions as session}
				<button class="relative w-full rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left transition hover:border-cyan-700/60 {guiState.selectedSessionId === session.id ? 'border-cyan-700/60 bg-cyan-500/5' : ''} {sessionHasApproval(session.id) ? 'border-amber-500/50' : ''}" onclick={() => runtime.selectSession(session.id)} aria-label={`Open session ${session.title}. Status: ${sessionHasApproval(session.id) ? 'waiting approval' : session.status}`}> 
					{#if guiState.selectedSessionId === session.id}<span class="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-cyan-300" aria-hidden="true"></span>{/if}
					<div class="flex items-center justify-between gap-2">
						<span class="truncate text-xs font-medium text-zinc-200">{session.title}</span>
						<span class="rounded px-1.5 py-0.5 text-[10px] {sessionHasApproval(session.id) ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}">Status: {sessionHasApproval(session.id) ? 'waiting approval' : session.status}</span>
					</div>
					<div class="sidebar-secondary mt-2 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
						<span class="truncate">{session.id}</span>
						<span>diff 0</span>
					</div>
				</button>
			{:else}
				<p class="rounded-lg border border-dashed border-zinc-800 p-3 text-xs text-zinc-500">No sessions yet. App-server events will appear here.</p>
			{/each}
		</div>
	</div>

	<footer class="space-y-2 border-t border-zinc-800 p-3">
		<div class="grid grid-cols-3 gap-2">
			<button class="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1.5 text-xs text-zinc-300 hover:border-cyan-700/60">+ New</button>
			<button class="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1.5 text-xs text-zinc-400 hover:border-zinc-700">Archived</button>
			<button class="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1.5 text-xs text-zinc-400 hover:border-zinc-700" onclick={() => onOpenSettings?.()}>Settings</button>
		</div>
		<p class="sidebar-footer-note text-[10px] text-zinc-600">Status placeholders · branch main · diff idle</p>
	</footer>
</aside>
