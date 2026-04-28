<script lang="ts">
	import type { WorkflowRunsInTarget } from "@daedalus-pi/app-server-protocol";
	import type { SessionBestNextAction } from "../client/runtime";

	const { runsIn, nextAction } = $props<{ runsIn?: WorkflowRunsInTarget; nextAction?: SessionBestNextAction }>();
	const targetPath = $derived(runsIn?.path ?? "No build target selected");
	const branch = $derived(runsIn?.branch ?? "detached");
	const isolationMode = $derived(runsIn?.isolationMode ?? "unknown");
	const isolationLabel = $derived(isolationMode === "isolated-worktree" ? "Safe worktree" : isolationMode === "base-checkout" ? "Base checkout" : "Target unknown");
	const action = $derived(nextAction ?? (runsIn?.validationStatus === "valid" ? { label: "Review diff" } : { label: "Resolve target", disabled: true, reason: runsIn?.reason ?? "Build target is not ready." }));
	const disabledReasonId = $derived(`build-target-disabled-${runsIn?.worktreeId ?? runsIn?.projectId ?? "none"}`);
</script>

<section class="build-target-trust-bar" aria-label="Build target" aria-live="polite" data-testid="build-target-trust-bar">
	<div class="build-target-zone build-target-main">
		<span class="eyebrow">Runs in</span>
		<strong title={targetPath}>{targetPath}</strong>
		<span class="build-target-branch">{branch}</span>
	</div>
	<div class="build-target-zone build-target-isolation">
		<span class="build-target-chip" data-state={isolationMode}>{isolationLabel}</span>
		<details>
			<summary>Full path</summary>
			<code>{targetPath}</code>
		</details>
	</div>
	<div class="build-target-zone build-target-action">
		<button type="button" class="btn-primary" disabled={action.disabled} aria-describedby={action.disabled ? disabledReasonId : undefined}>{action.label}</button>
		{#if action.disabled && action.reason}
			<p id={disabledReasonId} class="build-target-disabled-reason">{action.reason}</p>
		{/if}
	</div>
</section>
