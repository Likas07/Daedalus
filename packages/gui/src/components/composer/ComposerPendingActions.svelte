<script lang="ts">
	import type { ThreadPendingAction } from "@daedalus-pi/app-server-protocol";
	import type { ApprovalItem } from "../../client/view-model";

	type PendingQuestion = { id: string; prompt: string; choices?: readonly string[] };
	type PendingInput = { id: string; title: string; summary?: string };

	const { approvals = [], actions = [], questions = [], pendingInput = [], onApprove, onDeny, onAnswer } = $props<{
		approvals?: readonly ApprovalItem[];
		actions?: readonly ThreadPendingAction[];
		questions?: readonly PendingQuestion[];
		pendingInput?: readonly PendingInput[];
		onApprove?: (approvalId: string) => Promise<void> | void;
		onDeny?: (approvalId: string, message?: string) => Promise<void> | void;
		onAnswer?: (answer: string, questionId?: string) => Promise<void> | void;
	}>();

	let answer = $state("");
	let busy = $state(false);
	let error = $state("");

const actionApprovalIds = $derived(new Set(actions.filter((action: ThreadPendingAction) => action.kind === "approval" && action.approvalId).map((action: ThreadPendingAction) => action.approvalId as string)));
	const approval = $derived(approvals.find((item: ApprovalItem) => actionApprovalIds.size === 0 || actionApprovalIds.has(item.id)));
	const question = $derived(questions[0]);
	const input = $derived(pendingInput[0] ?? actions.find((action: ThreadPendingAction) => action.kind === "input"));
	const visibleAction = $derived(approval ? "approval" : question ? "question" : input ? "input" : undefined);

	async function run(task: () => Promise<void> | void): Promise<void> {
		if (busy) return;
		busy = true;
		error = "";
		try { await task(); answer = ""; }
		catch (cause) { error = cause instanceof Error ? cause.message : "Pending action failed."; }
		finally { busy = false; }
	}
	function submitAnswer(): void {
		const value = answer.trim();
		if (!value) return;
		void run(() => onAnswer?.(value, question?.id));
	}
	function keydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && visibleAction === "approval" && approval) {
			event.preventDefault();
			void run(() => onApprove?.(approval.id));
		}
		if (event.key === "Enter" && !event.shiftKey && visibleAction !== "approval") {
			event.preventDefault();
			submitAnswer();
		}
	}
</script>

{#if visibleAction}
	<div class="border border-ink-500 border-b-0 bg-ink-950/80 px-3 py-2" data-testid="composer-pending-actions" role="group" aria-label="Thread pending action">
		{#if visibleAction === "approval" && approval}
			<div class="flex items-center gap-3">
				<div class="min-w-0 flex-1">
					<div class="caps text-ember">approval required</div>
					<p class="truncate text-[12px] text-bone-100">{approval.summary}</p>
					<span class="font-mono text-[10px] text-bone-500">{approval.risk} risk · {approval.scope}</span>
				</div>
				<button type="button" disabled={busy} class="caps border border-gold px-3 py-1 text-gold hover:bg-gold hover:text-ink-950 disabled:opacity-50" onkeydown={keydown} onclick={() => void run(() => onApprove?.(approval.id))}>Approve <span class="ml-1 font-mono text-[10px]">⌘↵</span></button>
				<button type="button" disabled={busy} class="caps text-bone-300 hover:text-bone-50 disabled:opacity-50" onkeydown={keydown} onclick={() => void run(() => onDeny?.(approval.id))}>Deny</button>
			</div>
		{:else if question}
			<div class="flex items-center gap-2">
				<label class="min-w-0 flex-1"><span class="caps text-ember">question</span><span class="ml-2 text-[12px] text-bone-100">{question.prompt}</span><input class="mt-1 w-full bg-ink-900 px-2 py-1 font-mono text-[12px] text-bone-50 outline-none" bind:value={answer} onkeydown={keydown} placeholder="Answer and press Enter…" /></label>
				<button type="button" disabled={busy || !answer.trim()} class="caps border border-ink-400 px-3 py-1 text-bone-100 disabled:opacity-50" onclick={submitAnswer}>Answer</button>
			</div>
		{:else if input}
			<div class="flex items-center gap-2">
				<label class="min-w-0 flex-1"><span class="caps text-ember">input needed</span><span class="ml-2 text-[12px] text-bone-100">{input.title}</span>{#if input.summary}<span class="ml-2 text-[11px] text-bone-400">{input.summary}</span>{/if}<input class="mt-1 w-full bg-ink-900 px-2 py-1 font-mono text-[12px] text-bone-50 outline-none" bind:value={answer} onkeydown={keydown} placeholder="Reply and press Enter…" /></label>
				<button type="button" disabled={busy || !answer.trim()} class="caps border border-ink-400 px-3 py-1 text-bone-100 disabled:opacity-50" onclick={submitAnswer}>Send</button>
			</div>
		{/if}
		{#if error}<p class="mt-2 font-mono text-[10px] text-amber-300" role="alert">{error}</p>{/if}
	</div>
{/if}
