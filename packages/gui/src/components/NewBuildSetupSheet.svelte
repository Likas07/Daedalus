<script lang="ts">
	import type { NewBuildState } from "../client/new-build-state-machine";

	const { state } = $props<{ state?: NewBuildState }>();
	const prompt = $derived(state?.prompt ?? "");
	const branchPreview = $derived(state?.kind === "creatingWorktree" ? state.branchPreview : "build/<task-slug>");
	const pathPreview = $derived(state?.kind === "creatingWorktree" ? (state.pathPreview ?? "project worktree path will be created") : "safe worktree path will be created");
	const confirmingBase = $derived(state?.kind === "baseCheckoutConfirming" ? state : undefined);
</script>

<section class="new-build-setup-sheet" aria-labelledby="new-build-setup-title" data-testid="new-build-setup-sheet">
	<div class="sheet-kicker">New Build setup</div>
	<h2 id="new-build-setup-title">Start in a safe worktree</h2>
	<p class="setup-task-prompt"><span>Task prompt</span> {prompt || "Describe the build task below."}</p>
	<div class="setup-preview-grid">
		<div><span>Branch preview</span><code>{branchPreview}</code></div>
		<div><span>Path preview</span><code>{pathPreview}</code></div>
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
</section>
