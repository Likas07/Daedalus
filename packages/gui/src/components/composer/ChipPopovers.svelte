<script lang="ts">
	import type { AccessMode, RendererModel } from "../../client/gui-state-types";
	import type { UiState } from "../../client/ui-state.svelte";
	import AccessMenu from "./AccessMenu.svelte";
	import EffortMenu from "./EffortMenu.svelte";
	import ModelPicker from "./ModelPicker.svelte";
	import ModeMenu from "./ModeMenu.svelte";
	import type { ComposerMode } from "./composer-logic";

	const {
		ui,
		models,
		selectedModel,
		selectedModelInfo,
		onSelectModel,
		effort,
		onSelectEffort,
		fastMode,
		onSelectFastMode,
		mode,
		onSelectMode,
		accessMode,
		onSelectAccess,
	} = $props<{
		ui: UiState;
		models?: readonly RendererModel[];
		selectedModel?: string;
		selectedModelInfo?: RendererModel;
		onSelectModel?: (model: string) => void;
		effort?: string;
		onSelectEffort?: (effort: string) => void;
		fastMode: boolean;
		onSelectFastMode?: (value: boolean) => void;
		mode: ComposerMode;
		onSelectMode?: (mode: ComposerMode) => void;
		accessMode: AccessMode;
		onSelectAccess?: (mode: AccessMode) => void;
	}>();

	function sizeFor(kind: typeof ui.popoverKind): { w: number; h: number } {
		if (kind === "model") return { w: 420, h: 420 };
		if (kind === "effort") return { w: 280, h: 360 };
		if (kind === "mode") return { w: 320, h: 280 };
		if (kind === "access") return { w: 320, h: 220 };
		return { w: 0, h: 0 };
	}

	const style = $derived.by(() => {
		if (!ui.popoverKind || !ui.popoverAnchor) return "";
		const { w, h } = sizeFor(ui.popoverKind);
		const anchor = ui.popoverAnchor;
		const margin = 8;
		const bottom = Math.max(margin, window.innerHeight - anchor.top + margin);
		const maxH = Math.min(h, anchor.top - margin * 2);
		const left = Math.min(window.innerWidth - w - margin, Math.max(margin, anchor.left));
		return `position: fixed; bottom: ${bottom}px; left: ${left}px; width: ${w}px; max-height: ${maxH}px;`;
	});

	function close(): void {
		ui.popoverKind = null;
		ui.popoverAnchor = null;
	}
</script>

{#if ui.popoverKind}
	<div role="presentation" onclick={close} onkeydown={(e) => e.key === "Escape" && close()} class="fixed inset-0 z-40"></div>

	<div role="dialog" aria-modal="true" style={style} class="z-50 flex flex-col overflow-hidden border border-ink-500 bg-ink-900 shadow-2xl shadow-black/40">
		{#if ui.popoverKind === "model"}
			<ModelPicker {models} selected={selectedModel} onSelect={onSelectModel} {ui} />
		{:else if ui.popoverKind === "effort"}
			<EffortMenu {effort} onSelect={onSelectEffort} model={selectedModelInfo} {fastMode} onSelectFastMode={onSelectFastMode} {ui} />
		{:else if ui.popoverKind === "mode"}
			<ModeMenu {mode} onSelect={onSelectMode} {ui} />
		{:else if ui.popoverKind === "access"}
			<AccessMenu mode={accessMode} onSelect={onSelectAccess} {ui} />
		{/if}
	</div>
{/if}
