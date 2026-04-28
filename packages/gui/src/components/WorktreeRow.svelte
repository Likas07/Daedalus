<script lang="ts">
	import type { WorkflowWorktreeMetadata } from "@daedalus-pi/app-server-protocol";
	const { worktree, active = false, needsAttention = false, onSelect } = $props<{
		worktree: WorkflowWorktreeMetadata;
		active?: boolean;
		needsAttention?: boolean;
		onSelect?: (id: string) => void;
	}>();
</script>

<button
	class="group relative w-full rounded-sm border px-3 py-2.5 text-left transition"
	class:border-[color:var(--brass-rule)]={active}
	class:bg-[color:var(--brass-glow)]={active}
	class:border-[color:var(--rule)]={!active}
	class:bg-[color:var(--ink-3)]={!active}
	class:hover:border-[color:var(--rule-strong)]={!active}
	aria-label={`${worktree.branch ?? "detached"} worktree at ${worktree.path}${needsAttention ? ": needs attention" : ""}`}
	onclick={() => onSelect?.(String(worktree.id))}
>
	<div class="flex items-center justify-between gap-3">
		<span class="flex items-center gap-2 truncate">
			<span aria-hidden="true" class="font-display text-[14px] italic"
				class:text-[color:var(--brass)]={active}
				class:text-[color:var(--bone-faint)]={!active}
			>›</span>
			<span class="truncate font-mono text-[12px] text-[color:var(--bone)]">
				{worktree.branch ?? "detached"}
			</span>
		</span>
		<span class="font-mono text-[10.5px] tabular-nums text-[color:var(--bone-faint)]">
			{worktree.dirtyCount} dirty
		</span>
	</div>
	<div class="mt-1 truncate font-mono text-[10.5px] text-[color:var(--bone-faint)]">
		{worktree.path}
	</div>
	<div class="mt-2 flex flex-wrap gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--bone-faint)]">
		<span>{worktree.upstream ?? "no upstream"}</span>
		<span aria-hidden="true">·</span>
		<span>{worktree.activeSessionCount} sessions</span>
		{#if needsAttention}
			<span aria-hidden="true">·</span>
			<span class="text-[color:var(--ember)]">Needs attention</span>
		{/if}
		{#if worktree.cleanupRequiresConfirmation}
			<span aria-hidden="true">·</span>
			<span class="text-[color:var(--ember)]">confirm cleanup</span>
		{/if}
	</div>
</button>
