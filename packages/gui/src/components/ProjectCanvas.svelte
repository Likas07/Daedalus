<script lang="ts">
	import type { GuiRuntime, GuiState, SessionSummary } from "../client/runtime";
	import { createWorkflowState } from "../client/workflow-state";
	import ChangesPanel from "./ChangesPanel.svelte";
	import WorktreePanel from "./WorktreePanel.svelte";
	import TaskComposer from "./TaskComposer.svelte";

	const { state: guiState, runtime } = $props<{ state: GuiState; runtime: GuiRuntime }>();
	let query = $state("");
	const filteredSessions = $derived(
		guiState.sessions.filter((session: SessionSummary) => `${session.title} ${session.id}`.toLowerCase().includes(query.trim().toLowerCase())),
	);
	const projectDraftKey = $derived(`daedalus.gui.draft.project:${guiState.projectRoot ?? "new"}`);
	const workflow = $derived(createWorkflowState());

	async function startFromComposer(input: { prompt: string; path?: string }): Promise<void> {
		await runtime.startSessionFromPrompt({ path: input.path ?? guiState.projectRoot ?? "", prompt: input.prompt });
	}
</script>

<section class="project-canvas flex h-full min-h-0 flex-col bg-zinc-950">
	<header class="border-b border-zinc-800/80 px-5 py-4">
		<div class="flex items-start justify-between gap-4">
			<div>
				<p class="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Project cockpit</p>
				<h2 class="mt-1 text-lg font-semibold text-zinc-100">{guiState.projectRoot ?? "Choose a workspace"}</h2>
				<p class="mt-1 text-xs text-zinc-500">Quiet overview for sessions, worktrees, branches, and pending diffs.</p>
			</div>
			<button class="rounded-md border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-500" disabled>Open in editor</button>
		</div>
		<div class="mt-4 max-w-xl">
			<label class="sr-only" for="project-search">Search sessions and worktrees</label>
			<input id="project-search" name="projectSearch" class="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-cyan-700/70" bind:value={query} placeholder="Search sessions, branches, or worktrees…" />
		</div>
	</header>

	<div class="min-h-0 flex-1 overflow-auto p-5 pb-44">
		<div class="mb-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
			<WorktreePanel worktrees={workflow.worktrees} selectedWorktreeId={workflow.selectedWorktreeId} />
			<ChangesPanel git={workflow.git} />
		</div>
		{#if guiState.sessions.length === 0}
			<div class="grid h-full min-h-96 place-items-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 text-center">
				<div class="max-w-md px-6">
					<div class="mx-auto grid size-12 place-items-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-200">Δ</div>
					<h3 class="mt-4 text-base font-medium text-zinc-200">Start with a central task</h3>
					<p class="mt-2 text-sm leading-6 text-zinc-500">Describe the work below. Daedalus will open the project if needed and create the first session without reintroducing sidebar clutter.</p>
				</div>
			</div>
		{:else}
			<div class="space-y-2">
				{#each filteredSessions as session}
					<button class="group grid w-full grid-cols-[minmax(0,1fr)_160px_140px_120px] items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/35 px-4 py-3 text-left transition hover:border-cyan-700/60 hover:bg-zinc-900/60" onclick={() => runtime.selectSession(session.id)}>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-zinc-200">{session.title}</p>
							<p class="mt-1 truncate text-[11px] text-zinc-500">{session.id}</p>
						</div>
						<div class="text-xs text-zinc-400"><span class="text-zinc-600">branch</span><br /><span class="text-zinc-300">main</span></div>
						<div class="text-xs text-zinc-400"><span class="text-zinc-600">diff</span><br /><span class="text-zinc-300">0 files</span></div>
						<div class="justify-self-end rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-400">{session.status}</div>
					</button>
				{:else}
					<p class="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">No rows match “{query}”.</p>
				{/each}
			</div>
		{/if}
	</div>
	<div class="pointer-events-none sticky bottom-0 px-5 pb-5">
		<div class="pointer-events-auto">
			<TaskComposer projectPath={guiState.projectRoot} storageKey={projectDraftKey} requireProjectPath={!guiState.projectRoot} submitLabel="Start session" onSubmit={startFromComposer} />
		</div>
	</div>
</section>
