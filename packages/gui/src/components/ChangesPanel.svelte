<script lang="ts">
	import type { WorkflowGitStatus } from "@daedalus-pi/app-server-protocol";
	import { riskyFiles } from "../client/workflow-state";
	import GitSummaryBar from "./GitSummaryBar.svelte";
	const { git } = $props<{ git: WorkflowGitStatus }>();
	const risky = $derived(riskyFiles(git.files));
</script>
<section class="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
	<h3 class="mb-3 text-sm font-semibold text-zinc-200">Changes</h3><GitSummaryBar {git} />
	{#if risky.length}<p class="mt-3 rounded-md border border-amber-800/60 bg-amber-950/20 px-2 py-1 text-xs text-amber-200">Risky files: {risky.map((file) => file.path).join(', ')}</p>{/if}
	<ul class="mt-3 divide-y divide-zinc-900 text-xs">{#each git.files as file}<li class="flex items-center justify-between py-2"><span class="truncate text-zinc-300">{file.path}</span><span class="text-zinc-500">{file.status} · {file.staged ? 'staged' : 'unstaged'} · +{file.insertions} -{file.deletions}</span></li>{:else}<li class="py-2 text-zinc-500">No changes.</li>{/each}</ul>
</section>
