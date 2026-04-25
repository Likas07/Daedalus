<script lang="ts">
	import type { WorkflowWorktreeMetadata } from "@daedalus-pi/app-server-protocol";
	import WorktreeRow from "./WorktreeRow.svelte";
	const { worktrees = [], selectedWorktreeId, onSelect } = $props<{ worktrees?: readonly WorkflowWorktreeMetadata[]; selectedWorktreeId?: string; onSelect?: (id: string) => void }>();
</script>
<section class="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
	<header class="mb-3 flex items-center justify-between"><h3 class="text-sm font-semibold text-zinc-200">Worktrees</h3><span class="text-xs text-zinc-500">{worktrees.length}</span></header>
	<div class="space-y-2">{#each worktrees as worktree}<WorktreeRow {worktree} active={String(worktree.id) === selectedWorktreeId} {onSelect} />{:else}<p class="text-xs text-zinc-500">No worktrees yet.</p>{/each}</div>
</section>
