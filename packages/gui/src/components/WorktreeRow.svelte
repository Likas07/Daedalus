<script lang="ts">
	import type { WorkflowWorktreeMetadata } from "@daedalus-pi/app-server-protocol";
	const { worktree, active = false, onSelect } = $props<{ worktree: WorkflowWorktreeMetadata; active?: boolean; onSelect?: (id: string) => void }>();
</script>

<button class={`w-full rounded-lg border px-3 py-2 text-left text-xs ${active ? 'border-cyan-600 bg-cyan-950/30' : 'border-zinc-800 bg-zinc-900/40'}`} onclick={() => onSelect?.(String(worktree.id))}>
	<div class="flex items-center justify-between gap-3"><span class="truncate font-medium text-zinc-200">{worktree.branch ?? 'detached'}</span><span class="text-zinc-500">{worktree.dirtyCount} dirty</span></div>
	<div class="mt-1 truncate text-[11px] text-zinc-500">{worktree.path}</div>
	<div class="mt-2 flex gap-2 text-[10px] uppercase tracking-wide text-zinc-500"><span>{worktree.upstream ?? 'no upstream'}</span><span>{worktree.activeSessionCount} sessions</span>{#if worktree.cleanupRequiresConfirmation}<span class="text-amber-300">confirm cleanup</span>{/if}</div>
</button>
