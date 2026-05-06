import type { ExtensionUiRequest } from "@daedalus-pi/app-server-protocol";

export type ExtensionDialogSubmit = (
	request: ExtensionUiRequest,
	actionId: string,
	values: Record<string, unknown>,
) => void;

export function renderExtensionDialogs(requests: ExtensionUiRequest[], onSubmit: ExtensionDialogSubmit): HTMLElement {
	const root = document.createElement("div");
	root.className = "extension-dialogs";

	for (const request of requests) {
		root.append(renderExtensionDialog(request, onSubmit));
	}

	return root;
}

function renderExtensionDialog(request: ExtensionUiRequest, onSubmit: ExtensionDialogSubmit): HTMLElement {
	const dialog = document.createElement("section");
	dialog.className = "extension-dialog";
	dialog.dataset.requestId = request.requestId;

	const title = document.createElement("h2");
	title.textContent = request.title;
	dialog.append(title);

	if (request.description) {
		const description = document.createElement("p");
		description.textContent = request.description;
		dialog.append(description);
	}

	const fields = document.createElement("div");
	fields.className = "extension-dialog-fields";
	for (const field of request.fields) {
		fields.append(renderField(field));
	}
	dialog.append(fields);

	const actions = document.createElement("div");
	actions.className = "extension-dialog-actions";
	for (const action of request.actions) {
		const button = document.createElement("button");
		button.type = "button";
		button.dataset.actionId = action.id;
		button.textContent = action.label;
		button.addEventListener("click", () => onSubmit(request, action.id, collectFieldValues(dialog)));
		actions.append(button);
	}
	dialog.append(actions);

	return dialog;
}

function renderField(field: ExtensionUiRequest["fields"][number]): HTMLElement {
	const wrapper = document.createElement("label");
	wrapper.className = "extension-dialog-field";
	wrapper.textContent = field.label;

	const input = document.createElement(field.type === "textarea" ? "textarea" : "input");
	input.name = field.id;
	input.required = field.required ?? false;
	if (input instanceof HTMLInputElement) {
		input.type = field.type === "boolean" ? "checkbox" : field.type;
	}
	if (field.placeholder) input.setAttribute("placeholder", field.placeholder);
	if (field.defaultValue !== undefined) setElementValue(input, field.defaultValue);
	wrapper.append(input);

	return wrapper;
}

function collectFieldValues(dialog: HTMLElement): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const element of Array.from(dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"))) {
		values[element.name] = element instanceof HTMLInputElement && element.type === "checkbox" ? element.checked : element.value;
	}
	return values;
}

function setElementValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: unknown): void {
	if (element instanceof HTMLInputElement && element.type === "checkbox") {
		element.checked = Boolean(value);
		return;
	}
	element.value = value == null ? "" : String(value);
}
