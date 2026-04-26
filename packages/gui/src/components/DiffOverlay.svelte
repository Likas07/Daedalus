<script lang="ts">
	import type { GuiState } from "../client/runtime";
	import type { UiState } from "../client/ui-state.svelte";
	import { buildDiffReviewViewModel } from "../client/diff-view-model";
	import DiffViewer from "./DiffViewer.svelte";

	const { guiState, ui, runtime } = $props<{ guiState: GuiState; ui: UiState; runtime?: import("../client/runtime").GuiRuntime }>();
	const model = $derived(buildDiffReviewViewModel({ diff: guiState.activeDiff, selectedPath: ui.diffPath, workingTreeDiffId: guiState.lastProjectId ?? guiState.projectRoot, capabilities: guiState.capabilities, accessPolicy: guiState.accessPolicy }));
	let previousFocus: Element | null = null;
	let closeButton = $state<HTMLButtonElement>();

	function close(): void {
		ui.diffPath = null;
		if (previousFocus instanceof HTMLElement) previousFocus.focus();
	}

	$effect(() => {
		if (ui.diffPath === null) return;
		previousFocus = document.activeElement;
		setTimeout(() => closeButton?.focus(), 0);
		const onKeydown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			}
			if (event.key === "Tab") {
				event.preventDefault();
				closeButton?.focus();
			}
		};
		window.addEventListener("keydown", onKeydown);
		return () => window.removeEventListener("keydown", onKeydown);
	});
</script>

{#if ui.diffPath !== null}
	<div
		class="fixed inset-0 z-40 flex items-stretch justify-end bg-black/60 backdrop-blur-[2px]"
		role="dialog"
		aria-modal="true"
		aria-labelledby="diff-overlay-title"
		data-testid="diff-overlay"
	>
		<button
			type="button"
			class="flex-1 cursor-default"
			aria-label="Close diff"
			onclick={close}
		></button>
		<aside class="flex h-full w-[min(960px,80vw)] min-w-0 flex-col border-l border-ink-500 bg-ink-950 shadow-[0_0_60px_rgba(0,0,0,0.6)]">
			<div class="flex items-center justify-between gap-3 border-b border-ink-500 px-5 py-2 caps text-bone-400">
				<span id="diff-overlay-title">diff · {ui.diffPath}</span>
				<button
					type="button"
					bind:this={closeButton}
					onclick={close}
					class="text-bone-400 transition hover:text-bone-100"
					aria-label="Close diff"
				>esc · close</button>
			</div>
			<div class="min-h-0 flex-1">
				<DiffViewer diff={guiState.activeDiff} patch={model.selectedPatch} path={model.selectedPath} readonly={!model.canMutate} disabledReason={model.mutationDisabledReason} onStage={(paths) => runtime?.stageFiles?.(paths)} onUnstage={(paths) => runtime?.unstageFiles?.(paths)} onDiscard={(paths) => runtime?.discardFiles?.(paths)} onCommit={(message) => runtime?.commitChanges?.(message)} />
			</div>
		</aside>
	</div>
{/if}
