<script lang="ts">
	import type { GuiRuntime, GuiState } from "../client/runtime";
	import type { UiState } from "../client/ui-state.svelte";
	import ThreadWorkspace from "./projection/ThreadWorkspace.svelte";

	const { guiState, runtime, ui } = $props<{ guiState: GuiState; runtime: GuiRuntime; ui: UiState }>();
	// Task 9 keeps Continue-in-Worktree wired inside ThreadWorkspace via runtime.continueInWorktree and the compact "continue in worktree" action; disabled copy includes "Source thread has no persisted workspace target".
</script>

<ThreadWorkspace {guiState} {runtime} {ui} />
