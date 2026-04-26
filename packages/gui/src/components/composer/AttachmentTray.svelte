<script lang="ts">
	import type { ComposerDraftAttachment } from "../../client/gui-state-types";
	const { attachments = [], onRemove } = $props<{ attachments?: readonly ComposerDraftAttachment[]; onRemove?: (id: string) => void }>();
</script>
{#if attachments.length}
	<div class="flex flex-wrap gap-1.5" data-testid="attachment-tray">
		{#each attachments as attachment}
			<span class="context-chip"><span>{attachment.filename}</span><span class="tnum text-bone-400">{attachment.kind}</span><button type="button" aria-label="Remove {attachment.filename}" onclick={() => onRemove?.(attachment.id)}>×</button></span>
		{/each}
	</div>
{/if}
