<script lang="ts">
	import type { AutomationRule } from "@daedalus-pi/app-server-protocol";
	const { rules = [] } = $props<{ rules?: readonly AutomationRule[] }>();
</script>

<section class="space-y-2" data-testid="automation-rules-panel">
	{#each rules as rule}
		<article class="inspector-card">
			<div class="inspector-card-title">
				<span class="flex items-center gap-2">
					<span aria-hidden="true" class="font-display text-[14px] italic"
						class:text-[color:var(--brass)]={rule.enabled}
						class:text-[color:var(--bone-faint)]={!rule.enabled}
					>
						{rule.enabled ? "●" : "○"}
					</span>
					<span>{rule.title}</span>
				</span>
				<span class={rule.enabled ? "pill pill-green" : "pill"}>
					{rule.enabled ? "On" : "Off"}
				</span>
			</div>
			<p class="inspector-card-meta">{rule.description}</p>
			{#if rule.requiresConfirmation}
				<p class="font-mono text-[10px] text-[color:var(--ember)]">
					<span aria-hidden="true">!</span>
					requires confirmation{rule.destructive ? " for destructive actions" : ""}
				</p>
			{/if}
		</article>
	{:else}
		<p class="inspector-empty">No automation rules configured.</p>
	{/each}
</section>
