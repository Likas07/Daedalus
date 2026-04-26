<script lang="ts">
	import type { RendererSafeExtensionMetadata } from "../client/extension-surfaces";
	import type { ResourceItem } from "../client/resources-view-model";
	import ExtensionPermissionCard from "./ExtensionPermissionCard.svelte";
	const { extensions = [], resources = [] } = $props<{ extensions?: readonly RendererSafeExtensionMetadata[]; resources?: readonly ResourceItem[] }>();
	const extensionResources = $derived(resources.filter((resource: ResourceItem) => resource.kind === "extension"));
</script>

<section class="space-y-2" data-testid="extensions-manager">
	{#each extensionResources as resource}
		<article class="inspector-card">
			<div class="inspector-card-title">
				<span>{resource.name ?? resource.id}</span>
				<span class={resource.enabled ? "pill pill-green" : "pill"}>{resource.enabled ? "Enabled" : "Disabled"} · {resource.source ?? "unknown"}</span>
			</div>
			{#if resource.sourcePath}<p class="inspector-card-meta font-mono">{resource.sourcePath}</p>{/if}
			{#if resource.disabledReason}<p class="inspector-card-meta text-bone-400">{resource.disabledReason}</p>{/if}
			{#each resource.diagnostics ?? [] as diagnostic}<p class="inspector-card-meta text-[color:var(--crimson)]">{diagnostic}</p>{/each}
		</article>
	{/each}
	{#each extensions as extension}
		<article class="inspector-card">
			<div class="inspector-card-title">
				<span class="flex items-center gap-2">
					<span aria-hidden="true" class="font-display text-[14px] italic text-[color:var(--brass)]">¶</span>
					<span>{extension.name ?? extension.id}</span>
				</span>
				<span class={extension.enabled ? "pill pill-green" : "pill"}>
					{extension.enabled ? "Enabled" : "Disabled"} · {extension.version ?? "dev"}
				</span>
			</div>
			<p class="inspector-card-meta">
				{extension.capabilities.join(", ") || "No capabilities declared"}
			</p>
			{#if extension.permissions.length > 0}
				<div class="mt-1 space-y-1">
					{#each extension.permissions as permission}
						<ExtensionPermissionCard {permission} />
					{/each}
				</div>
			{/if}
			<p class="inspector-card-meta border-t border-[color:var(--rule)] pt-2">
				<span class="tnum">{extension.commands.length}</span> commands ·
				<span class="tnum">{extension.panes.length}</span> panes ·
				<span class="tnum">{extension.backgroundTasks.length}</span> tasks ·
				<span class="tnum {extension.errors.length > 0 ? 'text-[color:var(--crimson)]' : ''}">{extension.errors.length}</span> errors
			</p>
		</article>
	{:else}
		{#if extensionResources.length === 0}<p class="inspector-empty">No installed extensions.</p>{/if}
	{/each}
</section>
