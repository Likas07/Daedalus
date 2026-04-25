export function renderToolCallCard(title: string, body: unknown): HTMLElement {
	const card = document.createElement("article");
	card.className = "tool-call-card";
	const heading = document.createElement("h3");
	heading.textContent = title;
	const details = document.createElement("details");
	const summary = document.createElement("summary");
	summary.textContent = "Tool payload";
	const pre = document.createElement("pre");
	pre.textContent = typeof body === "string" ? body : JSON.stringify(body, null, 2);
	details.append(summary, pre);
	card.append(heading, details);
	return card;
}
