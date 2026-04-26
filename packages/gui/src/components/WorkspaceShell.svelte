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

	const projectLabel = $derived(state.projectRoot ?? "local app-server");
	const providerCount = $derived(state.providerStatuses.length);
	const approvalCount = $derived(state.approvalItems.length);
	const sessionCount = $derived(state.sessions.length);
</script>

<main class="workspace-shell h-screen overflow-hidden bg-paper text-[color:var(--bone)]">
	<div class="flex h-full flex-col">
		<header class="workspace-topbar flex h-14 items-center justify-between gap-4 px-5">
			<!-- left: wordmark + project -->
			<div class="flex min-w-0 items-center gap-4">
				<div class="flex items-center gap-3" data-no-drag>
					<div class="wordmark-mark mark-pulse" aria-hidden="true">Δ</div>
					<div class="leading-none">
						<div class="wordmark-name">DAEDALUS</div>
						<div class="wordmark-tag">atelier</div>
					</div>
				</div>
				<div class="hidden h-7 w-px bg-[color:var(--rule-strong)] md:block" aria-hidden="true"></div>
				<div class="hidden min-w-0 md:block">
					<div class="eyebrow eyebrow-brass">workspace</div>
					<div class="mt-0.5 truncate font-mono text-[12px] text-[color:var(--bone-soft)]">{projectLabel}</div>
				</div>
			</div>

			<!-- center: drafting scale -->
			<div class="hidden flex-1 items-center justify-center xl:flex" aria-hidden="true">
				<div class="scale-ticks">
					<span><span class="tick"></span>01</span>
					<span><span class="tick"></span>02</span>
					<span><span class="tick"></span>03 · INDEX</span>
					<span><span class="tick"></span>04 · FORGE</span>
					<span><span class="tick"></span>05</span>
				</div>
			</div>

			<!-- right: status pebbles -->
			<div class="workspace-status-strip flex items-center gap-2" aria-live="polite" aria-atomic="true" data-no-drag>
				<span class="pill" title="Provider count">
					<span class="text-[color:var(--bone-faint)]">prov</span>
					<span class="tnum text-[color:var(--bone)]">{providerCount || "—"}</span>
				</span>
				<span class="pill" title="Sessions">
					<span class="text-[color:var(--bone-faint)]">sess</span>
					<span class="tnum text-[color:var(--bone)]">{sessionCount}</span>
				</span>
				<span
					class="pill {approvalCount > 0 ? 'pill-ember' : ''}"
					data-testid="shell-approval-badge"
					title="Approvals pending"
				>
					<span class="text-[color:var(--bone-faint)]">aprv</span>
					<span class="tnum">{approvalCount}</span>
				</span>
				<span class="pill {state.connected ? 'pill-blue' : 'pill-crimson'}" title="Connection state">
					<span aria-hidden="true" class="inline-block size-1.5 rounded-full {state.connected ? 'bg-[color:var(--blueprint)]' : 'bg-[color:var(--crimson)]'}"></span>
					{state.connected ? "online" : "offline"}
				</span>
			</div>
		</header>

		<div class="workspace-layout-grid grid min-h-0 flex-1 grid-cols-[minmax(240px,19rem)_minmax(0,1fr)_minmax(320px,23rem)]">
			<div class="workspace-nav-pane min-w-0 resize-x overflow-auto">
				{@render navigation()}
			</div>
			<section class="surface-canvas min-w-0 overflow-hidden">
				{@render main()}
			</section>
			<div class="workspace-inspector-pane min-w-0 overflow-hidden" role="complementary" aria-label="Inspector drawer">
				{@render inspector()}
			</div>
		</div>

		<div class="shrink-0">
			{@render terminal()}
		</div>
	</div>
</main>
