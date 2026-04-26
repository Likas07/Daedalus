<script lang="ts">
	import type { ComposerSubmitInput } from "../client/composer-state";
	import type { GuiRuntime, GuiState } from "../client/runtime";
	import type { UiState } from "../client/ui-state.svelte";
	import TaskComposer from "./TaskComposer.svelte";

	const { guiState, runtime, ui, onViewChange, onPaletteOpenChange } = $props<{
		guiState: GuiState;
		runtime: GuiRuntime;
		ui: UiState;
		onViewChange?: (view: UiState["view"]) => void;
		onPaletteOpenChange?: (open: boolean) => void;
	}>();
	const draftKey = $derived(`daedalus.gui.draft.empty:${guiState.projectRoot ?? "new"}`);

	async function start(input: ComposerSubmitInput): Promise<void> {
		await runtime.startSessionFromPrompt({
			...input,
			path: input.path ?? guiState.projectRoot ?? "",
			projectId: input.projectId ?? guiState.lastProjectId,
		});
		onViewChange?.("session");
	}

	function focusComposer(): void {
		document.querySelector<HTMLTextAreaElement>('[data-testid="composer-prompt"]')?.focus();
	}
</script>

<section class="flex h-full flex-col" data-testid="empty-state">
	<div class="flex flex-1 flex-col items-center justify-center gap-6 px-10 text-center">
		<div class="font-wordmark text-[20px] font-medium tracking-[0.32em] text-bone-300">DAEDALUS</div>

		<p class="max-w-[44ch] text-[14px] leading-[1.7] text-bone-200">
			Pick a session to continue,
			<button
				type="button"
				onclick={() => onPaletteOpenChange?.(!ui.paletteOpen)}
				class="text-gold underline-offset-4 transition hover:underline"
			>open the palette</button>
			, or
			<button
				type="button"
				onclick={focusComposer}
				class="text-gold underline-offset-4 transition hover:underline"
			>start a new one</button>
			.
		</p>

		<div class="flex items-center gap-6 caps text-bone-400">
			<span class="flex items-center gap-2">
				<kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">Super+K</kbd>
				command palette
			</span>
			<span class="flex items-center gap-2">
				<kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">Super+N</kbd>
				new session
			</span>
		</div>
	</div>

	<div class="mx-auto w-full max-w-2xl px-10 pb-10 text-left">
		<TaskComposer
			{guiState}
			{runtime}
			{ui}
			projectPath={guiState.projectRoot}
			storageKey={draftKey}
			requireProjectPath={!guiState.projectRoot}
			submitLabel="Start session"
			onSubmit={start}
		/>
	</div>
</section>
