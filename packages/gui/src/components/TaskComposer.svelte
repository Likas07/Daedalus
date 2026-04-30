<script lang="ts">
	import { workflowFromTypedEvents } from "../client/daedalus-workflow-view-model";
	import type { ComposerSubmitInput } from "../client/composer-state";
	import type { GuiRuntime, GuiState } from "../client/runtime";
	import type { UiState } from "../client/ui-state.svelte";
	import Composer from "./composer/Composer.svelte";
	import NewBuildSetupSheet from "./NewBuildSetupSheet.svelte";
	import NeedsAttentionRecovery from "./NeedsAttentionRecovery.svelte";

	const {
		guiState,
		runtime,
		ui,
		projectPath,
		sessionId,
		storageKey,
		requireProjectPath = false,
		disabled = false,
		disabledReason,
		submitLabel = "Start session",
		onSubmit,
		showWorkflowPrompt = true,
	} = $props<{
		guiState: GuiState;
		runtime: GuiRuntime;
		ui: UiState;
		projectPath?: string;
		sessionId?: string;
		storageKey?: string;
		requireProjectPath?: boolean;
		disabled?: boolean;
		disabledReason?: string;
		submitLabel?: string;
		onSubmit?: (input: ComposerSubmitInput) => Promise<void> | void;
		showWorkflowPrompt?: boolean;
	}>();
	const workflow = $derived(workflowFromTypedEvents(guiState.events));
	const openQuestion = $derived(workflow?.questions.find((question) => question.status === "open"));
</script>

{#if showWorkflowPrompt && openQuestion}
	<div class="mb-2 rounded-md border border-[color:var(--ember-rule)] bg-[color:var(--ember-glow)] px-3 py-2 font-mono text-[11px] text-[color:var(--bone)]" data-testid="composer-question-prompt">
		<span class="uppercase tracking-[0.14em] text-[color:var(--ember)]">question</span>
		<span class="ml-2">{openQuestion.prompt}</span>
	</div>
{/if}
{#if guiState.newBuild && guiState.newBuild.kind !== "draft" && guiState.newBuild.kind !== "running"}
	<NewBuildSetupSheet state={guiState.newBuild} />
	<NeedsAttentionRecovery state={guiState.newBuild} blocking={guiState.newBuild.kind === "needsAttention"} />
{/if}
<Composer {guiState} {runtime} {ui} {projectPath} {sessionId} {storageKey} {requireProjectPath} {disabled} {disabledReason} {submitLabel} {onSubmit} />
