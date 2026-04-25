<script lang="ts">
	import type { Snippet } from "svelte";
	import type { GuiState } from "../client/runtime";

	const { state, navigation, main, inspector, terminal } = $props<{
		state: GuiState;
		navigation: Snippet;
		main: Snippet;
		inspector: Snippet;
		terminal: Snippet;
	}>();
</script>

<main class="workspace-shell h-screen overflow-hidden bg-zinc-950 text-zinc-100">
	<div class="flex h-full flex-col">
		<header class="workspace-topbar flex h-12 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/95 px-3">
			<div class="flex min-w-0 items-center gap-3">
				<div class="grid size-7 place-items-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-xs font-semibold text-cyan-200" aria-hidden="true">Δ</div>
				<div class="min-w-0">
					<h1 class="truncate text-sm font-semibold tracking-tight">Daedalus ADE</h1>
					<p class="truncate text-[10px] text-zinc-500">{state.projectRoot ?? "local app-server"}</p>
				</div>
			</div>
			<div class="workspace-status-strip flex items-center gap-2 text-[11px]" aria-live="polite" aria-atomic="true">
				<span class="rounded-full border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 text-zinc-400">Providers: {state.providerStatuses.length || "No"}</span>
				<span class="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200" data-testid="shell-approval-badge">Approvals pending: {state.approvalItems.length}</span>
				<span class="rounded-full border px-2 py-0.5 {state.connected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}">Connection: {state.connected ? "Connected" : "Offline"}</span>
			</div>
		</header>

		<div class="workspace-layout-grid grid min-h-0 flex-1 grid-cols-[minmax(220px,18rem)_minmax(0,1fr)_minmax(300px,22rem)]">
			<div class="workspace-nav-pane min-w-0 resize-x overflow-auto border-r border-zinc-800/80 bg-zinc-950/80">
				{@render navigation()}
			</div>
			<section class="min-w-0 overflow-hidden bg-zinc-950">
				{@render main()}
			</section>
			<div class="workspace-inspector-pane min-w-0 overflow-hidden border-l border-zinc-800/80 bg-zinc-950/80" role="complementary" aria-label="Inspector drawer">
				{@render inspector()}
			</div>
		</div>

		<div class="shrink-0">
			{@render terminal()}
		</div>
	</div>
</main>
