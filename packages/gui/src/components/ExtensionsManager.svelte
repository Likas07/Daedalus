<script lang="ts">
	import type { RendererSafeExtensionMetadata } from "../client/extension-surfaces";
	import ExtensionPermissionCard from "./ExtensionPermissionCard.svelte";
	const { extensions = [] } = $props<{ extensions?: readonly RendererSafeExtensionMetadata[] }>();
</script>
<section class="space-y-2" data-testid="extensions-manager">
	{#each extensions as extension}
		<article class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
			<div class="flex justify-between"><h3 class="text-sm text-zinc-100">{extension.name ?? extension.id}</h3><span class="text-xs text-zinc-400">{extension.enabled ? 'Enabled' : 'Disabled'} · {extension.version ?? 'dev'}</span></div>
			<p class="mt-1 text-xs text-zinc-500">{extension.capabilities.join(', ') || 'No capabilities declared'}</p>
			<div class="mt-2 space-y-1">{#each extension.permissions as permission}<ExtensionPermissionCard {permission} />{/each}</div>
			<p class="mt-2 text-[11px] text-zinc-500">{extension.commands.length} commands · {extension.panes.length} panes · {extension.backgroundTasks.length} background tasks · {extension.errors.length} errors</p>
		</article>
	{:else}<p class="text-xs text-zinc-500">No installed extensions.</p>{/each}
</section>
