<script lang="ts">
	import type { AutomationRule } from "@daedalus-pi/app-server-protocol";
	const { rules = [] } = $props<{ rules?: readonly AutomationRule[] }>();
</script>
<section class="space-y-2" data-testid="automation-rules-panel">
	{#each rules as rule}<article class="rounded border border-zinc-800 bg-zinc-900/50 p-2 text-xs"><div class="flex justify-between"><strong class="text-zinc-100">{rule.title}</strong><span class="text-zinc-500">{rule.enabled ? 'On' : 'Off'}</span></div><p class="text-zinc-400">{rule.description}</p>{#if rule.requiresConfirmation}<p class="text-amber-300">Requires confirmation{rule.destructive ? ' for destructive actions' : ''}</p>{/if}</article>{:else}<p class="text-xs text-zinc-500">No automation rules configured.</p>{/each}
</section>
