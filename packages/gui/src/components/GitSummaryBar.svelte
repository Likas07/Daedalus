<script lang="ts">
	import type { WorkflowGitStatus } from "@daedalus-pi/app-server-protocol";
	import { summarizeDiff } from "../client/workflow-state";
	const { git } = $props<{ git: WorkflowGitStatus }>();
</script>
<div class="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
	<strong class="text-zinc-200">{git.branch ?? 'detached'}</strong><span>{git.upstream ?? 'no upstream'}</span><span>↑ {git.ahead} ↓ {git.behind}</span><span>{git.stagedCount} staged</span><span>{git.unstagedCount} unstaged</span><span>{summarizeDiff(git)}</span>
</div>
