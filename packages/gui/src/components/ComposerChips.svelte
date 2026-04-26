<script lang="ts">
	export type ComposerChipKind =
		| "project"
		| "session"
		| "mode"
		| "draft"
		| "file"
		| "diff"
		| "issue"
		| "pr"
		| "link";
	export interface ComposerChip {
		readonly id: string;
		readonly kind: ComposerChipKind;
		readonly label: string;
		readonly removable?: boolean;
	}

	const { chips = [], onRemove } = $props<{
		chips?: readonly ComposerChip[];
		onRemove?: (chip: ComposerChip) => void;
	}>();

	function chipGlyph(kind: ComposerChipKind): string {
		switch (kind) {
			case "project":
				return "¶";
			case "session":
				return "§";
			case "mode":
				return "Δ";
			case "draft":
				return "✎";
			case "file":
				return "▤";
			case "diff":
				return "±";
			case "issue":
				return "◆";
			case "pr":
				return "⇄";
			case "link":
				return "↗";
			default:
				return "·";
		}
	}
</script>

{#if chips.length > 0}
	<div class="composer-chip-row" aria-label="Composer context">
		{#each chips as chip (chip.id)}
			<span class="context-chip context-chip-data" data-kind={chip.kind}>
				<span aria-hidden="true" class="context-chip-glyph">{chipGlyph(chip.kind)}</span>
				<span class="context-chip-key">{chip.kind}</span>
				<span class="context-chip-val">{chip.label}</span>
				{#if chip.removable !== false}
					<button
						type="button"
						class="context-chip-remove"
						aria-label={`Remove ${chip.kind} ${chip.label}`}
						onclick={() => onRemove?.(chip)}
					>
						×
					</button>
				{/if}
			</span>
		{/each}
	</div>
{/if}
