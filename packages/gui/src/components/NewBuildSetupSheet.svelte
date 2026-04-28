<script lang="ts">
	import type { NewBuildState } from "../client/new-build-state-machine";

	const { state } = $props<{ state?: NewBuildState }>();
	const prompt = $derived(state?.prompt ?? "");
	const branchPreview = $derived(
		state?.kind === "creatingWorktree"
			? state.branchPreview
			: state?.kind === "verifyingWorktree" || state?.kind === "readyToStart" || state?.kind === "partialWorktreeCreated"
				? state.worktree.branch
				: "build/<task-slug>",
	);
	const pathPreview = $derived(
		state?.kind === "creatingWorktree"
			? (state.pathPreview ?? "project worktree path will be created")
			: state?.kind === "verifyingWorktree" || state?.kind === "readyToStart" || state?.kind === "partialWorktreeCreated"
				? state.worktree.path
				: "safe worktree path will be created",
	);
	const confirmingBase = $derived(state?.kind === "baseCheckoutConfirming" ? state : undefined);
	const failed = $derived(state?.kind === "setupFailed" ? state : undefined);
	const partial = $derived(state?.kind === "partialWorktreeCreated" ? state : undefined);
	const canceled = $derived(state?.kind === "setupCanceled" ? state : undefined);
	const status = $derived(statusFor(state));
	const failedOutcome = $derived(failed?.outcome);

	function statusFor(current: NewBuildState | undefined): { label: string; detail: string; busy?: boolean; tone?: "danger" | "warning" | "success" } {
		switch (current?.kind) {
			case "derivingTarget":
				return { label: "Preparing safe build target", detail: "Choosing a branch name and worktree target.", busy: true };
			case "creatingWorktree":
				return { label: "Creating safe worktree", detail: "Creating an isolated worktree before starting the session.", busy: true };
			case "verifyingWorktree":
				return { label: "Verifying worktree", detail: `Checking ${current.worktree.path} is ready.`, busy: true };
			case "readyToStart":
				return { label: "Worktree ready", detail: "Starting the build session now.", busy: true, tone: "success" };
			case "startingSession":
				return { label: "Starting session", detail: "Connecting the prompt to the selected build target.", busy: true };
			case "setupFailed":
				return { label: "Setup failed", detail: current.message, tone: "danger" };
			case "partialWorktreeCreated":
				return { label: "Worktree needs attention", detail: current.message, tone: "warning" };
			case "baseCheckoutConfirming":
				return { label: "Confirmation required", detail: "Review the current checkout risk before continuing.", tone: "warning" };
			case "cancelingSetup":
				return { label: "Canceling setup", detail: "Stopping the new build setup flow.", busy: true };
			case "setupCanceled":
				return { label: "Setup canceled", detail: "Edit the prompt or send it again to retry.", tone: "warning" };
			default:
				return { label: "Ready to start", detail: "Safe worktree will be created before the session starts." };
		}
	}
</script>

<section class="new-build-setup-sheet" aria-labelledby="new-build-setup-title" data-testid="new-build-setup-sheet">
	<div class="sheet-kicker">New Build setup</div>
	<h2 id="new-build-setup-title">Start in a safe worktree</h2>
	<p class="setup-task-prompt"><span>Task prompt</span> {prompt || "Describe the build task below."}</p>
	<div class="setup-preview-grid">
		<div><span>Branch preview</span><code>{branchPreview}</code></div>
		<div><span>Path preview</span><code>{pathPreview}</code></div>
	</div>
	<div
		class="setup-status"
		class:busy={status.busy}
		class:danger={status.tone === "danger"}
		class:warning={status.tone === "warning"}
		role={failed || partial ? "alert" : "status"}
		aria-live="polite"
		data-testid="new-build-setup-status"
	>
		<strong>{status.label}</strong>
		<p>{status.detail}</p>
	</div>
	<label class="setup-locked-default"><input type="checkbox" checked disabled /> Safe worktree is locked on by default</label>
	<details class="setup-advanced">
		<summary>Advanced base-checkout disclosure</summary>
		<p>Base checkout can modify the current checkout and is never remembered as a preference.</p>
	</details>
	{#if confirmingBase}
		<div class="setup-base-warning" role="alert" aria-label="Base checkout confirmation required" data-testid="base-checkout-warning">
			<strong>Confirmation required before using current checkout.</strong>
			<p>Current path: <code>{confirmingBase.path}</code></p>
			<p>Current branch: <code>{confirmingBase.branch}</code></p>
			<p>Dirty files: <code>{confirmingBase.dirtyCount}</code></p>
			<button type="button" disabled aria-describedby="base-checkout-disabled-reason">Continue</button>
			<p id="base-checkout-disabled-reason">Continue is disabled until this checkout is explicitly validated and confirmed.</p>
		</div>
	{/if}
	{#if failed}
		<div class="setup-failure-actions" role="alert" aria-label="New build setup failed" data-testid="new-build-setup-failure">
			<strong>{failed.message}</strong>
			{#if failedOutcome}
				<div class="mt-2 font-mono text-[10px] text-[color:var(--bone-soft)]" data-testid="worktree-create-outcome">
					<p>Outcome: <code>{failedOutcome.outcome}</code></p>
					{#if failedOutcome.operationId}<p>Operation: <code>{failedOutcome.operationId}</code></p>{/if}
					{#if "reason" in failedOutcome && failedOutcome.reason}<p>Reason: <code>{failedOutcome.reason}</code></p>{/if}
				</div>
			{/if}
			<p>Retry by sending the prompt again, edit the prompt or branch target, or cancel this setup and return to the composer.</p>
			<div class="setup-action-row" aria-label="Available recovery actions">
				<span>Retry</span>
				<span>Edit prompt or branch</span>
				<span>Cancel setup</span>
			</div>
		</div>
	{/if}
	{#if partial}
		<div class="setup-base-warning" role="alert" aria-label="Worktree verification failed" data-testid="new-build-setup-partial">
			<strong>{partial.message}</strong>
			<p>Worktree path: <code>{partial.worktree.path}</code></p>
			<p>Retry setup, locate the worktree, or cancel and archive the partial worktree before starting again.</p>
		</div>
	{/if}
	{#if canceled}
		<div class="setup-base-warning" role="status" data-testid="new-build-setup-canceled">
			<strong>Setup canceled.</strong>
			<p>Edit the prompt or send it again when you are ready to create a safe worktree.</p>
		</div>
	{/if}
</section>
