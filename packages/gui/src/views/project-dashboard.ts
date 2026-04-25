import type { GuiState } from "../client/runtime";
export function renderProjectDashboard(state: GuiState): HTMLElement {
	const el = document.createElement("section");
	el.className = "panel dashboard";
	el.innerHTML = `<h2>Project dashboard</h2><p>${state.projectRoot ?? "Browser session"}</p><strong>${state.sessions.length}</strong> sessions`;
	return el;
}
