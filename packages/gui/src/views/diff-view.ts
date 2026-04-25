import type { GuiState } from "../client/runtime";
import { createWorkflowState, summarizeDiff } from "../client/workflow-state";
import { renderToolCallCard } from "../components/tool-call-card";

export function renderDiffView(state: GuiState): HTMLElement {
	const workflow = createWorkflowState();
	const el = document.createElement("section");
	el.className = "panel diff-view";
	el.innerHTML = `<h2>Diff & activity</h2><p>${summarizeDiff(workflow.git)}</p>`;
	for (const event of state.events.slice(-10)) el.append(renderToolCallCard(event.type, event.payload));
	return el;
}
