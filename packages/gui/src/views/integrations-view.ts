import type { GuiState } from "../client/runtime";

export function renderIntegrationsView(state: GuiState): HTMLElement {
	const el = document.createElement("section");
	el.className = "panel integrations";
	const integrations = state.integrations;
	el.innerHTML = "<h2>Integrations</h2>";
	if (!integrations.length) {
		const empty = document.createElement("p");
		empty.textContent = "No integration state published yet";
		el.append(empty);
		return el;
	}
	for (const integration of integrations) {
		const item = document.createElement("article");
		item.className = "integration-card";
		const repo = integration.repository
			? `${integration.repository.owner}/${integration.repository.name}`
			: "No repository detected";
		item.innerHTML = `<h3>${integration.provider}</h3><p>Status: ${integration.status}</p><p>Repository: ${repo}</p>`;
		item.append(
			list(
				"Linked issues",
				integration.issues.map(
					(issue) =>
						`${issue.id}${issue.title ? ` — ${issue.title}` : ""}${issue.state ? ` (${issue.state})` : ""}`,
				),
			),
		);
		item.append(
			list(
				"Pull requests",
				integration.pullRequests.map(
					(pr) => `#${pr.number}${pr.title ? ` — ${pr.title}` : ""}${pr.state ? ` (${pr.state})` : ""}`,
				),
			),
		);
		item.append(
			list(
				"CI checks",
				integration.ciChecks.map(
					(check) => `${check.name}: ${check.status}${check.summary ? ` — ${check.summary}` : ""}`,
				),
			),
		);
		el.append(item);
	}
	return el;
}

function list(title: string, rows: readonly string[]): HTMLElement {
	const wrap = document.createElement("div");
	const h = document.createElement("h4");
	h.textContent = title;
	wrap.append(h);
	const ul = document.createElement("ul");
	for (const row of rows.length ? rows : ["None"]) {
		const li = document.createElement("li");
		li.textContent = row;
		ul.append(li);
	}
	wrap.append(ul);
	return wrap;
}
