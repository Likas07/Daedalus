<script lang="ts">
	import type { ProjectionShellStore } from "../../client/projection-runtime";
	import type { ShellThreadSummary } from "@daedalus-pi/app-server-protocol";

	const { shell, onSelectThread } = $props<{ shell: ProjectionShellStore; onSelectThread?: (threadId: string) => void | Promise<void> }>();
	function statusClass(thread: ShellThreadSummary): string {
		if (thread.pendingActionCount > 0) return "pill pill-ember";
		if (thread.status === "running") return "pill pill-blue";
		if (thread.status === "failed") return "pill pill-crimson";
		if (thread.status === "completed") return "pill pill-green";
		return "pill";
	}
</script>

<aside class="flex h-full min-h-0 flex-col" aria-label="Thread navigation">
	<div class="px-3 pb-2 pt-4"><div class="eyebrow eyebrow-brass px-1">Threads · {shell.threads.length}</div></div>
	<div class="min-h-0 flex-1 overflow-auto pb-2" role="list" aria-label="Projected Threads">
		{#each shell.threads as thread, idx (thread.threadId)}
			<button type="button" class="nav-row group" data-active={shell.selectedThreadId === thread.threadId} onclick={() => onSelectThread?.(thread.threadId)} aria-label={`Open Thread ${thread.title}. Status: ${thread.status}. ${thread.pendingActionCount} pending approvals`}>
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<div class="flex items-center gap-2"><span class="font-mono text-[10px] tabular-nums text-bone-400">{(idx + 1).toString().padStart(2, "0")}</span><span class="truncate text-[13px] font-medium text-bone-100">{thread.title}</span></div>
						<div class="mt-1 truncate font-mono text-[10.5px] text-bone-400">{thread.worktreeId ?? thread.projectId ?? thread.sessionId}</div>
						{#if thread.lastMessage}<div class="mt-1 line-clamp-2 text-[11px] text-bone-300">{thread.lastMessage}</div>{/if}
					</div>
					<div class="flex shrink-0 flex-col items-end gap-1"><span class={statusClass(thread)} aria-label={`Status: ${thread.status}`}>{thread.status}</span>{#if thread.pendingActionCount > 0}<span class="pill pill-ember" aria-label={`${thread.pendingActionCount} pending actions`}>{thread.pendingActionCount}</span>{/if}</div>
				</div>
			</button>
		{:else}
			<div class="m-3 rounded-md border border-dashed border-ink-500 p-5 text-center text-bone-400">No projected Threads</div>
		{/each}
	</div>
</aside>
