<script lang="ts">
	import type { WorkflowGitStatus } from "@daedalus-pi/app-server-protocol";
	import { riskyFiles } from "../client/workflow-state";
	import GitSummaryBar from "./GitSummaryBar.svelte";

	const { git, onFileClick } = $props<{ git: WorkflowGitStatus; onFileClick?: (path: string) => void }>();
	const risky = $derived(riskyFiles(git.files));

	function statusGlyph(status: string): string {
		if (status === "added") return "+";
		if (status === "deleted") return "−";
		if (status === "renamed") return "↪";
		if (status === "modified") return "±";
		return "·";
	}
</script>

<section class="rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-2)] p-4">
	<header class="mb-3 flex items-baseline justify-between gap-2">
		<div>
			<div class="eyebrow eyebrow-brass">plate · changes</div>
			<h3 class="mt-0.5 font-display text-[18px] italic text-[color:var(--bone)]">Changes</h3>
		</div>
		<span class="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--bone-faint)]">
			{git.files.length} file{git.files.length === 1 ? "" : "s"}
		</span>
	</header>

	<GitSummaryBar {git} />

	{#if risky.length}
		<p class="mt-3 flex items-start gap-2 rounded-sm border border-[color:var(--ember)]/40 bg-[color:var(--ember)]/8 px-3 py-2 font-mono text-[11px] text-[color:var(--ember)]">
			<span aria-hidden="true" class="font-display text-[14px] italic leading-none">!</span>
			<span><strong class="font-mono">risky:</strong> {risky.map((file) => file.path).join(", ")}</span>
		</p>
	{/if}

	<ul class="mt-3 divide-y divide-[color:var(--rule)] font-mono text-[11.5px]">
		{#each git.files as file}
			<li class="py-2">
				<button type="button" class="flex w-full items-center justify-between gap-2 text-left" onclick={() => onFileClick?.(file.path)} data-testid="changed-file">
					<span class="flex min-w-0 items-center gap-2 truncate">
						<span aria-hidden="true" class="text-[color:var(--brass)] tabular-nums">{statusGlyph(file.status)}</span>
						<span class="truncate text-[color:var(--bone)]">{file.path}</span>
					</span>
				<span class="flex shrink-0 items-center gap-2 tabular-nums text-[color:var(--bone-faint)]">
					<span class="text-[color:var(--diff-add)]">+{file.insertions}</span>
					<span class="text-[color:var(--diff-rm)]">−{file.deletions}</span>
					<span class="rounded-sm border border-[color:var(--rule)] px-1.5 py-px text-[9.5px] uppercase tracking-[0.12em]">
						{file.staged ? "staged" : "unstaged"}
					</span>
					</span>
				</button>
			</li>
		{:else}
			<li class="py-3 text-center font-display text-[13px] italic text-[color:var(--bone-soft)]">
				No changes.
			</li>
		{/each}
	</ul>
</section>
