<script lang="ts">
	import type { WorkflowWorktreeMetadata } from "@daedalus-pi/app-server-protocol";
	import WorktreeRow from "./WorktreeRow.svelte";
	const { worktrees = [], selectedWorktreeId, onSelect, onCreate, recoveryMode = false } = $props<{
		worktrees?: readonly WorkflowWorktreeMetadata[];
		selectedWorktreeId?: string;
		onSelect?: (id: string) => void;
		onCreate?: () => void;
		recoveryMode?: boolean;
	}>();
</script>

<section class="rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-2)] p-4">
	<header class="mb-3 flex items-baseline justify-between gap-2">
		<div>
			<div class="eyebrow eyebrow-brass">plate · worktrees</div>
			<h3 class="mt-0.5 font-display text-[18px] italic text-[color:var(--bone)]">Worktrees</h3>
		</div>
		<div class="flex items-center gap-1.5">
			<button class="pill tnum" type="button" onclick={() => onCreate?.()} disabled={!onCreate} title={onCreate ? "Create worktree" : "Open a project before creating a worktree"}>+ worktree</button>
			<span class="pill tnum">
				<span class="text-[color:var(--bone-faint)]">count</span>
				<span>{worktrees.length}</span>
			</span>
		</div>
	</header>
	<div class="space-y-1.5">
		{#each worktrees as worktree}
			<WorktreeRow {worktree} active={String(worktree.id) === selectedWorktreeId} {onSelect} needsAttention={recoveryMode && worktree.validationStatus !== "valid"} />
		{:else}
			<p class="inspector-empty">No worktrees yet.</p>
		{/each}
	</div>
</section>
