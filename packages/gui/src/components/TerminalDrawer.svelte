<script lang="ts">
	import type { GuiRuntime, GuiState } from "../client/runtime";
	import { removeTerminal, selectExistingTerminal, terminalEvidenceRow } from "./terminal/terminal-state";
	import { disposeManagedXterm } from "./terminal/xterm-manager";
	import XtermViewport from "./terminal/XtermViewport.svelte";
	import TerminalHeader from "./TerminalHeader.svelte";
	import TerminalTabs from "./TerminalTabs.svelte";

	const { state: appState, runtime, onCollapse } = $props<{ state: GuiState; runtime: GuiRuntime; onCollapse?: () => void }>();
	const activeTerminal = $derived(appState.terminals.find((terminal: import("../client/gui-state-types").RendererTerminal) => terminal.terminalId === appState.activeTerminalId) ?? appState.terminals[0]);
	const evidenceRows = $derived(appState.terminals.map(terminalEvidenceRow));

	async function createTerminal(): Promise<void> {
		const selectedSession = appState.sessions.find((session: import("../client/runtime").SessionSummary) => session.id === appState.selectedSessionId);
		const selectedWorktree = appState.worktrees.find((worktree: import("@daedalus-pi/app-server-protocol").WorkflowWorktreeMetadata) => worktree.id === selectedSession?.worktreeId);
		const cwd = selectedWorktree?.path ?? selectedSession?.cwd ?? appState.projectRoot;
		if (!cwd) throw new Error("Choose a project before creating a terminal.");
		await runtime.createTerminal({ cwd, projectId: appState.lastProjectId, worktreeId: selectedSession?.worktreeId, cols: 100, rows: 24 });
	}
	function selectTerminal(id: string): void {
		appState.activeTerminalId = id;
		void runtime.replayTerminal(id);
		runtime.notify();
	}
	async function closeTerminal(id: string): Promise<void> {
		await runtime.killTerminal(id);
		disposeManagedXterm(id);
		appState.terminals = removeTerminal(appState.terminals, id);
		appState.activeTerminalId = selectExistingTerminal(appState.terminals, appState.activeTerminalId);
		runtime.notify();
	}
</script>

<section class="terminal-shell flex h-72 flex-col" data-testid="terminal-drawer">
	<div class="flex items-center justify-between gap-3 px-4 pt-2">
		<div class="flex items-center gap-3">
			<span class="eyebrow eyebrow-brass">forge · 04 · terminal</span>
			<span aria-hidden="true" class="h-px w-8 bg-[color:var(--rule-strong)]"></span>
			<span class="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">{appState.terminals.length} session{appState.terminals.length === 1 ? "" : "s"}</span>
		</div>
		<span class="font-display text-[12px] italic text-bone-400">furnace</span>
	</div>
	<TerminalTabs terminals={appState.terminals} selectedTerminalId={activeTerminal?.terminalId} onSelect={selectTerminal} onNew={() => void createTerminal()} onClose={(id) => void closeTerminal(id)} />
	<TerminalHeader terminal={activeTerminal} onKill={() => activeTerminal && void closeTerminal(activeTerminal.terminalId)} {onCollapse} />
	<div class="min-h-0 flex-1">
		{#if activeTerminal}
			<XtermViewport terminalId={activeTerminal.terminalId} history={activeTerminal.history} {runtime} />
		{:else}
			<div class="flex h-full items-center justify-center bg-black/60 font-mono text-xs text-bone-400">
				<button class="btn-mini" type="button" onclick={() => void createTerminal()}>Create terminal</button>
			</div>
		{/if}
	</div>
	<div class="border-t border-ink-500 bg-black/30 px-4 py-2" data-testid="terminal-evidence">
		<div class="mb-1 caps text-bone-500">terminal evidence</div>
		<div class="grid gap-1">
			{#each evidenceRows as row}
				<div class="grid grid-cols-[minmax(0,1fr)_80px_64px_minmax(0,1fr)_110px] gap-2 font-mono text-[10.5px] text-bone-400" data-testid="terminal-evidence-row">
					<span class="truncate" title={row.cwd}>{row.cwd}</span>
					<span>{row.status}</span>
					<span>{row.exit}</span>
					<span class="truncate" title={row.outputTail}>{row.outputTail || "no output"}</span>
					<span class="truncate">{row.link ?? row.id}</span>
				</div>
			{/each}
		</div>
	</div>
</section>
