<script lang="ts">
	import { threadScopedPendingActions, workflowFromTypedEvents } from "../../client/daedalus-workflow-view-model";
	import type { ComposerSubmitInput } from "../../client/composer-state";
	import type { ProjectionThreadStore } from "../../client/projection-runtime";
	import type { GuiRuntime, GuiState } from "../../client/runtime";
	import type { UiState } from "../../client/ui-state.svelte";
	import ComposerPendingActions from "../composer/ComposerPendingActions.svelte";
	import TaskComposer from "../TaskComposer.svelte";

	const { guiState, runtime, ui, thread, disabled = false, disabledReason, onSubmit } = $props<{
		guiState: GuiState;
		runtime: GuiRuntime;
		ui: UiState;
		thread?: ProjectionThreadStore;
		disabled?: boolean;
		disabledReason?: string;
		onSubmit?: (input: ComposerSubmitInput) => Promise<void> | void;
	}>();

	const workflow = $derived(workflowFromTypedEvents(guiState.events));
	const scoped = $derived(threadScopedPendingActions({
		threadId: thread?.threadId,
		sessionId: thread?.sessionId,
		workflow,
		approvals: guiState.approvalItems,
		threadActions: thread?.pendingActions ?? [],
		sessions: guiState.sessions,
	}));
	const storageKey = $derived(thread?.threadId ? `thread-composer:${thread.threadId}` : undefined);
	const submitLabel = $derived(thread?.status === "running" ? "Send turn" : "Reply to thread");

	async function submit(input: ComposerSubmitInput): Promise<void> {
		if (onSubmit) return await onSubmit(input);
		if (!thread?.sessionId) return;
		await runtime.startTurn({ ...input, sessionId: thread.sessionId, prompt: input.prompt });
	}
	async function answer(value: string): Promise<void> {
		if (!thread?.sessionId) return;
		await runtime.startTurn({ sessionId: thread.sessionId, prompt: value });
	}
</script>

<div class="bg-ink-950" data-testid="thread-composer">
	<ComposerPendingActions
		approvals={scoped.approvals}
		actions={scoped.threadActions}
		questions={scoped.openQuestions}
		pendingInput={scoped.pendingInput}
		onApprove={(approvalId) => runtime.respondToApproval(approvalId, "approved")}
		onDeny={(approvalId, message) => runtime.respondToApproval(approvalId, "denied", message)}
		onAnswer={answer}
	/>
	<TaskComposer
		{guiState}
		{runtime}
		{ui}
		projectPath={thread?.projectId ? guiState.projectRoot : guiState.projectRoot}
		sessionId={thread?.sessionId}
		{storageKey}
		{disabled}
		{disabledReason}
		{submitLabel}
		onSubmit={submit}
		showWorkflowPrompt={false}
	/>
</div>
