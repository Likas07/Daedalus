<script lang="ts">
	import type { AuditEntry } from "@daedalus-pi/app-server-protocol";
	const { entries = [] } = $props<{ entries?: readonly AuditEntry[] }>();
</script>
<section class="space-y-2" data-testid="audit-trail-panel">
	{#each entries as entry}<article class="rounded border border-zinc-800 bg-zinc-900/50 p-2 text-xs"><div class="flex justify-between"><strong class="text-zinc-100">{entry.title}</strong><span class="text-zinc-500">{entry.kind}</span></div><p class="text-zinc-400">{entry.summary}</p>{#if entry.target}<p class="text-[11px] text-cyan-300">{entry.target}</p>{/if}</article>{:else}<p class="text-xs text-zinc-500">Audit trail is empty.</p>{/each}
</section>
