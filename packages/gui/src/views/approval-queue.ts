import type { GuiState } from "../client/runtime";

export function renderApprovalQueue(state: GuiState): HTMLElement {
	const el = document.createElement("section");
	el.className = "panel approvals";
	el.innerHTML = `<h2>Approval queue</h2><p>${state.approvalItems.length} approvals pending</p>`;
	return el;
}
