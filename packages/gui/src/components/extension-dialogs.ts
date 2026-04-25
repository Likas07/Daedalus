import type { ExtensionUiField, ExtensionUiRequest } from "@daedalus-pi/app-server-protocol";

export function renderExtensionDialogs(
	requests: readonly ExtensionUiRequest[],
	respond: (request: ExtensionUiRequest, actionId: string, values: Record<string, unknown>) => void,
): HTMLElement {
	const root = document.createElement("section");
	root.className = "panel extension-dialogs";
	root.innerHTML = "<h2>Extension dialogs</h2>";
	for (const request of requests) root.append(renderDialog(request, respond));
	if (requests.length === 0) root.append(empty("No pending extension UI."));
	return root;
}

function renderDialog(
	request: ExtensionUiRequest,
	respond: (request: ExtensionUiRequest, actionId: string, values: Record<string, unknown>) => void,
): HTMLElement {
	const form = document.createElement("form");
	form.className = "extension-dialog";
	form.dataset.requestId = request.requestId;
	form.innerHTML = `<h3>${escapeText(request.title)}</h3><p>${escapeText(request.description ?? request.extensionId)}</p>`;
	for (const field of request.fields) form.append(renderField(field));
	const actions = document.createElement("div");
	actions.className = "actions";
	for (const action of request.actions) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = `button ${action.style ?? "secondary"}`;
		button.textContent = action.label;
		button.dataset.actionId = action.id;
		button.addEventListener("click", () => respond(request, action.id, collectValues(form, request.fields)));
		actions.append(button);
	}
	form.append(actions);
	return form;
}

function renderField(field: ExtensionUiField): HTMLElement {
	const label = document.createElement("label");
	label.textContent = field.label;
	let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
	if (field.type === "textarea") input = document.createElement("textarea");
	else if (field.type === "select") {
		const select = document.createElement("select");
		for (const option of field.options ?? []) {
			const item = document.createElement("option");
			item.value = String(option.value);
			item.textContent = option.label;
			select.append(item);
		}
		input = select;
	} else {
		const element = document.createElement("input");
		element.type = field.type === "boolean" ? "checkbox" : field.type;
		input = element;
	}
	input.name = field.id;
	input.dataset.fieldType = field.type;
	if (field.placeholder) input.setAttribute("placeholder", field.placeholder);
	if (field.required) input.required = true;
	if (field.defaultValue !== undefined) setValue(input, field.defaultValue);
	label.append(input);
	return label;
}

function collectValues(form: HTMLFormElement, fields: readonly ExtensionUiField[]): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const field of fields) {
		const input = form.elements.namedItem(field.id) as
			| HTMLInputElement
			| HTMLTextAreaElement
			| HTMLSelectElement
			| null;
		if (!input) continue;
		values[field.id] =
			field.type === "boolean"
				? (input as HTMLInputElement).checked
				: field.type === "number"
					? Number(input.value)
					: input.value;
	}
	return values;
}
function setValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: unknown): void {
	if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(value);
	else input.value = String(value);
}
function empty(text: string): HTMLElement {
	const p = document.createElement("p");
	p.className = "muted";
	p.textContent = text;
	return p;
}
function escapeText(text: string): string {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}
