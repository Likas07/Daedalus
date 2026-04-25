import type { GuiState } from "../client/runtime";
export function renderExtensionsView(state: GuiState): HTMLElement {
	const el = document.createElement("section");
	el.className = "panel extensions";
	el.innerHTML = "<h2>Extensions</h2>";
	const n = document.createElement("div");
	n.innerHTML = `<h3>Notifications</h3><p>${state.notifications.join("\n") || "No notifications"}</p><h3>Diagnostics</h3><p>${state.diagnostics.join("\n") || "No diagnostics"}</p><h3>Status widgets</h3><p>${state.connected ? "Connected" : "Disconnected"}</p>`;
	el.append(n);
	return el;
}
