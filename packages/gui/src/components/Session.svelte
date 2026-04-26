<script lang="ts">
	import type { GuiRuntime, GuiState } from "../client/runtime";
	import type { UiState } from "../client/ui-state.svelte";
	import SessionWorkspace from "./SessionWorkspace.svelte";

	const { guiState, runtime, ui } = $props<{ guiState: GuiState; runtime: GuiRuntime; ui: UiState }>();
</script>

<SessionWorkspace {guiState} {runtime} {ui} />
