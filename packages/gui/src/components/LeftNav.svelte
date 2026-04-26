<script lang="ts">
	import type { RendererProject } from "../client/gui-state-types";
	import type { GuiRuntime, GuiState, SessionSummary } from "../client/runtime";
	import type { UiState } from "../client/ui-state.svelte";
	import type { ApprovalItem } from "../client/view-model";

	const { guiState, runtime, ui, onViewChange, onPaletteOpenChange } = $props<{
		guiState: GuiState;
		runtime: GuiRuntime;
		ui: UiState;
		onViewChange?: (view: UiState["view"]) => void;
		onPaletteOpenChange?: (open: boolean, mode?: UiState["paletteMode"]) => void;
	}>();
	let open = $state({ projects: true, sessions: true });
	const projectRows = $derived.by((): RendererProject[] =>
		guiState.projects.length > 0
			? [...guiState.projects]
			: guiState.projectRoot
				? [{ id: guiState.lastProjectId ?? "local", path: guiState.projectRoot, name: guiState.projectRoot.split("/").filter(Boolean).at(-1) }]
				: [],
	);
	const activeProject = $derived(projectRows.find((project: RendererProject) => project.path === guiState.projectRoot) ?? projectRows[0]);

	function hasApproval(sessionId: string): boolean {
		return guiState.approvalItems.some((approval: ApprovalItem) => approval.sessionId === sessionId);
	}

	function liveSessionCount(projectPath: string | undefined): number {
		if (projectPath !== guiState.projectRoot) return 0;
		return guiState.sessions.filter((session: SessionSummary) =>
			["active", "running", "waiting", "waiting_for_approval"].includes(session.status),
		).length;
	}

	function mark(session: SessionSummary): "awaiting" | "running" | "paused" | "archived" {
		if (hasApproval(session.id) || session.status === "waiting" || session.status === "waiting_for_approval") return "awaiting";
		if (session.status === "running" || session.status === "active") return "running";
		if (session.status === "archived" || session.status === "completed" || session.status === "done") return "archived";
		return "paused";
	}

	function setView(view: UiState["view"]): void {
		onViewChange?.(view);
	}

	function openProjectPalette(): void {
		onPaletteOpenChange?.(true, "project");
		if (!onPaletteOpenChange) window.dispatchEvent(new CustomEvent("daedalus:palette-open", { detail: { open: true, mode: "project" } }));
	}
</script>

{#snippet sectionHeader(key: "projects" | "sessions", label: string, count: number)}
	<button
		type="button"
		onclick={() => (open[key] = !open[key])}
		aria-expanded={open[key]}
		class="group flex w-full items-center justify-between py-3 text-left transition hover:text-bone-50"
	>
		<span class="caps text-bone-300 group-hover:text-bone-100">{label}</span>
		<span class="flex items-center gap-3">
			<span class="font-mono text-[10px] text-bone-400">{count.toString().padStart(2, "0")}</span>
			<span
				class="inline-block w-2 text-center font-mono text-[11px] leading-none text-bone-400 transition-transform duration-150 {open[key] ? 'rotate-90' : ''}"
				aria-hidden="true"
			>›</span>
		</span>
	</button>
{/snippet}

<aside class="flex h-full flex-col" data-testid="left-nav">
	<div class="min-h-0 flex-1 overflow-y-auto px-5 text-[12.5px]">

		<section class="border-b border-ink-500">
			<div class="flex items-center gap-2">
				<div class="min-w-0 flex-1">{@render sectionHeader("projects", "projects", projectRows.length)}</div>
				<button
					type="button"
					data-testid="sidebar-open-project"
					onclick={openProjectPalette}
					aria-label="Add or open project folder"
					class="rounded-sm border border-ink-500 px-2 py-1 font-mono text-[12px] text-bone-300 transition hover:border-gold hover:text-bone-50"
				>+</button>
			</div>
			{#if open.projects}
				<ul class="space-y-0.5 pb-4">
					{#each projectRows as project}
						{@const isActive = project.path === guiState.projectRoot}
						{@const live = liveSessionCount(project.path)}
						<li>
							<button
								class="group grid w-full grid-cols-[1fr_auto] items-baseline gap-x-3 py-1 text-left transition {isActive ? 'text-bone-50' : 'text-bone-200 hover:text-bone-50'}"
								onclick={() => { if (project.path) void runtime.openProject(project.path); setView('empty'); }}
							>
								<span class="flex min-w-0 items-baseline gap-2">
									<span class="truncate text-[13px] {isActive ? 'font-medium text-bone-50' : ''}">{project.name ?? project.path}</span>
									{#if live > 0}
										<span
											class="inline-block h-1 w-1 shrink-0 translate-y-[-1px] rounded-full bg-gold"
											aria-label="{live} live session{live === 1 ? '' : 's'}"
										></span>
									{/if}
								</span>
								<span class="font-mono text-[10px] text-bone-400 tabular-nums">{isActive ? "active" : ""}</span>
							</button>
						</li>
					{:else}
						<li class="py-2 font-mono text-[10px] text-bone-400">open a project to populate navigation</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section>
			{@render sectionHeader("sessions", `${activeProject?.name ?? "project"} · sessions`, guiState.sessions.length)}
			{#if open.sessions}
				<ul class="space-y-1 pb-4">
					{#each guiState.sessions as session}
						{@const m = mark(session)}
						{@const isActive = guiState.selectedSessionId === session.id && ui.view === "session"}
						{@const branch = guiState.worktrees.find((worktree: import("../client/view-model").WorktreeSummary) => (worktree.activeSessionIds ?? []).includes(session.id))?.branch ?? session.id}
						<li>
							<button
								onclick={() => { runtime.selectSession(session.id); setView('session'); }}
								class="group grid w-full grid-cols-[10px_1fr_auto] items-baseline gap-x-3 py-1 text-left {isActive ? 'text-bone-50' : m === 'archived' ? 'text-bone-400 hover:text-bone-200' : 'text-bone-200 hover:text-bone-50'}"
								title={m}
							>
								{#if m === "awaiting"}
									<span class="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-gold bg-transparent" aria-label="awaiting input"></span>
								{:else if m === "running"}
									<span class="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-gold" aria-label="running"></span>
								{:else if m === "paused"}
									<span class="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-bone-300" aria-label="paused"></span>
								{:else}
									<span class="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-bone-500" aria-label="archived"></span>
								{/if}
								<div class="min-w-0">
									<div class="truncate text-[12.5px] {isActive ? 'font-medium' : ''}">{session.title}</div>
									<div class="truncate font-mono text-[10px] text-bone-400">{branch}</div>
								</div>
								{#if hasApproval(session.id)}
									<span class="caps shrink-0 text-gold-soft">approval</span>
								{/if}
							</button>
						</li>
					{:else}
						<li class="my-3 border border-dashed border-ink-500 px-4 py-3 text-center text-[11px] text-bone-400">
							No sessions yet
						</li>
					{/each}
				</ul>
			{/if}
		</section>

	</div>

	<footer class="border-t border-ink-500">
		<button
			type="button"
			onclick={() => setView("settings")}
			class="flex w-full items-center justify-between border-b border-ink-500 px-5 py-2.5 text-left caps {ui.view === 'settings' ? 'text-gold' : 'text-bone-400 hover:text-bone-100'}"
		>
			<span>settings</span>
			<span class="font-mono text-[10px] tracking-normal text-bone-500">Super+,</span>
		</button>
		<div class="flex">
			<button
				type="button"
				onclick={() => { runtime.selectSession(undefined); setView('empty'); }}
				class="flex-1 px-5 py-2.5 text-left caps text-bone-400 transition hover:text-bone-100"
			>
				+ new
			</button>
			<button
				type="button"
				class="flex-1 border-l border-ink-500 px-5 py-2.5 text-left caps text-bone-400 transition hover:text-bone-100"
			>
				archived
			</button>
		</div>
	</footer>
</aside>
