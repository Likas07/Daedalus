import type { GuiState } from "../client/runtime";
export function renderSessionView(state: GuiState): HTMLElement {
	const el = document.createElement("section");
	el.className = "panel sessions";
	el.innerHTML = "<h2>Sessions</h2>";
	const list = document.createElement("ul");
	for (const s of state.sessions) {
		const li = document.createElement("li");
		li.textContent = `${s.title} — ${s.status}`;
		list.append(li);
	}
	el.append(list);
	return el;
}
