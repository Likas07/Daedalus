import type { GuiState } from "../client/runtime";
import { buildDiffReviewViewModel } from "../client/diff-view-model";
import { renderToolCallCard } from "../components/tool-call-card";

export function renderDiffView(state: GuiState): HTMLElement {
	const model = buildDiffReviewViewModel({ diff: state.activeDiff, workingTreeDiffId: state.lastProjectId ?? state.projectRoot, capabilities: state.capabilities, accessPolicy: state.accessPolicy });
	const el = document.createElement("section");
	el.className = "panel diff-view";
	el.innerHTML = `<h2>Diff review</h2><p>${model.files.length} changed file(s)${model.selectedPath ? ` · selected ${model.selectedPath}` : ""}</p>`;
	const list = document.createElement("ul");
	for (const file of model.files) {
		const item = document.createElement("li");
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = `${file.path} +${file.insertions} −${file.deletions}`;
		button.addEventListener("click", () => {
			state.activeDiff = state.activeDiff ? { ...state.activeDiff, files: state.activeDiff.files } : state.activeDiff;
		});
		item.append(button);
		list.append(item);
	}
	el.append(list);
	for (const event of state.events.slice(-10)) el.append(renderToolCallCard(event.type, event.payload));
	return el;
}
