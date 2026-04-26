<script lang="ts">
	import type { WorkflowGitStatus } from "@daedalus-pi/app-server-protocol";
	import { summarizeDiff } from "../client/workflow-state";
	const { git } = $props<{ git: WorkflowGitStatus }>();
</script>

<div class="flex flex-wrap items-center gap-2 rounded-sm border border-[color:var(--rule)] bg-[color:var(--ink-3)] px-3 py-2 font-mono text-[11px] text-[color:var(--bone-soft)]">
	<span class="pill pill-brass">
		<span aria-hidden="true">⎇</span>
		<span>{git.branch ?? "detached"}</span>
	</span>
	<span class="text-[color:var(--bone-faint)]">{git.upstream ?? "no upstream"}</span>
	<span class="ml-auto flex items-center gap-2 tabular-nums">
		<span><span class="text-[color:var(--bone-faint)]">↑</span> {git.ahead}</span>
		<span><span class="text-[color:var(--bone-faint)]">↓</span> {git.behind}</span>
		<span aria-hidden="true" class="text-[color:var(--rule-strong)]">·</span>
		<span><span class="text-[color:var(--bone-faint)]">staged</span> {git.stagedCount}</span>
		<span><span class="text-[color:var(--bone-faint)]">unstaged</span> {git.unstagedCount}</span>
		<span aria-hidden="true" class="text-[color:var(--rule-strong)]">·</span>
		<span class="text-[color:var(--bone)]">{summarizeDiff(git)}</span>
	</span>
</div>
