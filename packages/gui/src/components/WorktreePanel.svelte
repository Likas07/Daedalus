<script lang="ts">
	import type { WorkflowWorktreeMetadata } from "@daedalus-pi/app-server-protocol";
	import WorktreeRow from "./WorktreeRow.svelte";
	const { worktrees = [], selectedWorktreeId, onSelect, onCreate, onScanCleanup, onConfirmCleanup, recoveryMode = false } = $props<{
		worktrees?: readonly WorkflowWorktreeMetadata[];
		selectedWorktreeId?: string;
		onSelect?: (id: string) => void;
		onCreate?: () => void;
		onScanCleanup?: (id: string) => Promise<string | undefined> | string | undefined;
		onConfirmCleanup?: (id: string, confirmationToken?: string) => Promise<string | undefined> | string | undefined;
		recoveryMode?: boolean;
	}>();
	let cleanupMessages = $state<Record<string, string>>({});
	async function scanCleanup(id: string): Promise<void> {
		cleanupMessages = { ...cleanupMessages, [id]: "Scanning cleanup risk…" };
		try {
			cleanupMessages = { ...cleanupMessages, [id]: (await onScanCleanup?.(id)) ?? "Cleanup scan complete." };
		} catch (error) {
			cleanupMessages = { ...cleanupMessages, [id]: error instanceof Error ? error.message : "Cleanup scan failed." };
		}
	}
	async function confirmCleanup(id: string, confirmationToken?: string): Promise<void> {
		cleanupMessages = { ...cleanupMessages, [id]: "Cleaning worktree…" };
		try {
			cleanupMessages = { ...cleanupMessages, [id]: (await onConfirmCleanup?.(id, confirmationToken)) ?? "Worktree cleanup complete." };
		} catch (error) {
			cleanupMessages = { ...cleanupMessages, [id]: error instanceof Error ? error.message : "Worktree cleanup failed." };
		}
	}
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
			<div class="space-y-1">
				<WorktreeRow {worktree} active={String(worktree.id) === selectedWorktreeId} {onSelect} needsAttention={recoveryMode && worktree.status !== "ready"} cleanupMessage={cleanupMessages[String(worktree.id)]} />
				{#if onScanCleanup || onConfirmCleanup}
					<div class="flex flex-wrap gap-1 pl-2 font-mono text-[10px]">
						<button class="pill" type="button" disabled={!onScanCleanup} onclick={() => void scanCleanup(String(worktree.id))}>scan cleanup</button>
						{#if worktree.cleanupRisk?.confirmationToken || worktree.cleanupRequiresConfirmation}
							<button class="pill" type="button" disabled={!onConfirmCleanup || !worktree.cleanupRisk?.confirmationToken} title={worktree.cleanupRisk?.confirmationToken ? "Confirm cleanup" : "Run cleanup scan to get a confirmation token"} onclick={() => void confirmCleanup(String(worktree.id), worktree.cleanupRisk?.confirmationToken)}>confirm cleanup</button>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<p class="inspector-empty">No worktrees yet.</p>
		{/each}
	</div>
</section>
