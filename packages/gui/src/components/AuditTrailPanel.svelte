<script lang="ts">
	import type { AuditEntry } from "@daedalus-pi/app-server-protocol";
	const { entries = [] } = $props<{ entries?: readonly AuditEntry[] }>();

	function kindToneClass(kind: string): string {
		if (kind === "tool") return "pill pill-blue";
		if (kind === "approval") return "pill pill-ember";
		if (kind === "extension") return "pill pill-brass";
		return "pill";
	}
</script>

<section class="space-y-2" data-testid="audit-trail-panel">
	<header class="flex items-baseline justify-between">
		<h3 class="inspector-heading">Audit ledger</h3>
		<span class="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--bone-faint)]">
			{entries.length} entries
		</span>
	</header>
	{#each entries as entry, idx}
		<article class="inspector-card">
			<div class="inspector-card-title">
				<span class="flex items-center gap-2">
					<span class="font-mono text-[9.5px] tabular-nums text-[color:var(--bone-faint)]">
						{(idx + 1).toString().padStart(3, "0")}
					</span>
					<span>{entry.title}</span>
				</span>
				<span class={kindToneClass(entry.kind)}>{entry.kind}</span>
			</div>
			<p class="inspector-card-meta">{entry.summary}</p>
			{#if entry.target}
				<p class="font-mono text-[10.5px] text-[color:var(--blueprint)]">{entry.target}</p>
			{/if}
		</article>
	{:else}
		<p class="inspector-empty">Audit trail is empty.</p>
	{/each}
</section>
