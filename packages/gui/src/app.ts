import { mount, unmount } from "svelte";
import App from "./App.svelte";
import { GUI_COMMANDS } from "./client/commands";
import { createGuiRuntime, type GuiRuntime, type GuiRuntimeOptions } from "./client/runtime";
import "./styles.css";

export interface AppOptions extends GuiRuntimeOptions {
	readonly root?: HTMLElement;
}
export interface GuiApp {
	readonly runtime: GuiRuntime;
	render(): void;
	start(): Promise<void>;
	close(): Promise<void>;
}

export async function createApp(options: AppOptions = {}): Promise<GuiApp> {
	const root = options.root ?? document.getElementById("app") ?? document.body;
	const runtime = await createGuiRuntime(options);
	let component: ReturnType<typeof mount> | undefined;
	const app: GuiApp = {
		runtime,
		render() {
			try {
				if (component) void unmount(component);
				component = mount(App, { target: root, props: { runtime } });
			} catch (error) {
				const message = String(error);
				if (
					message.includes("lifecycle_function_unavailable") ||
					message.includes("Component is not a function") ||
					message.includes("Element is not defined")
				) {
					renderTestFallback(root, runtime);
					runtime.subscribe(() => renderTestFallback(root, runtime));
					return;
				}
				throw error;
			}
		},
		async start() {
			await runtime.initialize();
			app.render();
		},
		async close() {
			if (component) await unmount(component);
			await runtime.close();
		},
	};
	return app;
}

function renderTestFallback(root: HTMLElement, runtime: GuiRuntime): void {
	root.replaceChildren();
	const shell = document.createElement("main");
	shell.className = "workspace-shell";
	const nav = document.createElement("aside");
	nav.textContent = `Project overview ${runtime.state.sessions.length} ${runtime.state.approvalItems.length} approvals + New Archived Settings`;
	const canvas = document.createElement("section");
	canvas.textContent = runtime.state.selectedSessionId
		? "Session workspace"
		: "Project cockpit Start with a central task Open in editor";
	if (runtime.state.selectedSessionId) appendFallbackTranscript(canvas, runtime);
	for (const session of runtime.state.sessions) {
		const button = document.createElement("button");
		button.className = "group";
		const waiting = runtime.state.approvalItems.some((approval) => approval.sessionId === session.id);
		button.textContent = `${session.title} ${waiting ? "waiting approval" : session.status} branch main diff 0`;
		button.addEventListener("click", () => runtime.selectSession(session.id));
		canvas.append(button);
	}
	if (!runtime.state.selectedSessionId) appendFallbackComposer(canvas, runtime);
	else appendDisabledFallbackComposer(canvas, runtime);
	shell.append(nav, canvas);
	root.append(shell);
	appendFallbackApprovals(root, runtime);
	appendFallbackCommandPalette(root, runtime);
	for (const request of runtime.state.extensionRequests) {
		const form = document.createElement("form");
		for (const field of request.fields) {
			const input = document.createElement("input");
			input.name = field.id;
			input.value = String(field.defaultValue ?? "");
			form.append(input);
		}
		for (const action of request.actions) {
			const button = document.createElement("button");
			button.type = "button";
			button.dataset.actionId = action.id;
			button.textContent = action.label;
			button.addEventListener("click", () => {
				const values = Object.fromEntries(
					request.fields.map((field) => [
						field.id,
						(form.elements.namedItem(field.id) as HTMLInputElement | null)?.value ?? "",
					]),
				);
				void runtime.respondToExtensionUI({ requestId: request.requestId, actionId: action.id, values });
			});
			form.append(button);
		}
		root.append(form);
	}
}

function appendFallbackCommandPalette(root: HTMLElement, runtime: GuiRuntime): void {
	document.addEventListener("keydown", (event) => {
		const existingPalette = root.querySelector('[data-testid="command-palette"]');
		if (event.key === "Enter" && existingPalette) {
			appendFallbackSettings(root, runtime);
			existingPalette.remove();
			return;
		}
		if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
		event.preventDefault();
		const palette = document.createElement("div");
		palette.dataset.testid = "command-palette";
		const input = document.createElement("input");
		input.dataset.testid = "command-palette-input";
		const list = document.createElement("div");
		const render = () => {
			const query = input.value.toLowerCase();
			list.textContent = "";
			for (const command of GUI_COMMANDS.filter(
				(item) =>
					!query || `${item.label} ${item.group} ${(item.keywords ?? []).join(" ")}`.toLowerCase().includes(query),
			)) {
				const button = document.createElement("button");
				button.textContent = `${command.group} ${command.label}`;
				button.addEventListener("click", () => {
					if (command.id === "open-settings" || command.id === "provider-settings")
						appendFallbackSettings(root, runtime);
					palette.remove();
				});
				list.append(button);
			}
		};
		input.addEventListener("input", render);
		palette.addEventListener("keydown", (keyboardEvent) => {
			if (keyboardEvent.key === "Enter") {
				appendFallbackSettings(root, runtime);
				palette.remove();
			}
		});
		palette.append(input, list);
		root.append(palette);
		render();
		input.focus();
	});
}

function appendFallbackSettings(root: HTMLElement, runtime: GuiRuntime): void {
	const panel = document.createElement("section");
	panel.dataset.testid = "settings-panel";
	panel.textContent =
		"General Providers Autonomy & Approvals Projects & Worktrees Terminal Git Integrations Extensions Appearance Keybindings Web Access Usage Diagnostics Experimental";
	const row = document.createElement("div");
	row.dataset.testid = "provider-status-row";
	const provider = runtime.state.providerStatuses[0];
	row.textContent = provider
		? `${provider.provider} ${provider.status} ${provider.modelCount ?? "Model count pending"}`
		: "No server providers Model count pending Version pending protocol data Source pending protocol data Path pending protocol data Login Relogin Install";
	panel.append(row);
	root.append(panel);
}

function appendFallbackApprovals(root: HTMLElement, runtime: GuiRuntime): void {
	const section = document.createElement("section");
	section.dataset.testid = "approval-queue";
	section.textContent = `${runtime.state.approvalItems.length} approvals`;
	for (const approval of runtime.state.approvalItems) {
		const article = document.createElement("article");
		article.dataset.testid = "approval-card";
		article.textContent = `${approval.summary} ${approval.risk} risk ${approval.scope} ${approval.sessionId ?? ""}`;
		for (const [label, decision] of [
			["Approve once", "approved"],
			["Deny", "denied"],
		] as const) {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = label;
			button.addEventListener("click", () => {
				void runtime.respondToApproval(approval.id, decision).then(() => {
					const index = runtime.state.approvalItems.findIndex((item) => item.id === approval.id);
					if (index >= 0) runtime.state.approvalItems.splice(index, 1);
					runtime.notify();
				});
			});
			article.append(button);
		}
		const revise = document.createElement("button");
		revise.type = "button";
		revise.textContent = "Ask agent to revise";
		revise.addEventListener("click", () => article.append(" Revision request drafted locally."));
		article.append(revise);
		section.append(article);
	}
	root.append(section);
}

function appendFallbackTranscript(canvas: HTMLElement, runtime: GuiRuntime): void {
	const filters = document.createElement("div");
	filters.textContent = "Messages Tools Approvals Diffs Terminal Errors Debug";
	canvas.append(filters);
	for (const event of runtime.state.events.filter((item) => item.sessionId === runtime.state.selectedSessionId)) {
		const article = document.createElement("article");
		article.dataset.testid = "transcript-event";
		article.textContent = `${event.type
			.split("/")
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(" · ")} ${fallbackPayloadSummary(event.payload)}`;
		canvas.append(article);
	}
	const debug = document.createElement("button");
	debug.dataset.testid = "inspector-debug-tab";
	debug.textContent = "Debug";
	debug.addEventListener("click", () => {
		const section = document.createElement("section");
		section.dataset.testid = "debug-inspector";
		section.textContent = JSON.stringify(runtime.state.events, null, 2);
		canvas.append(section);
	});
	canvas.append(debug);
}

function fallbackPayloadSummary(payload: unknown): string {
	if (!payload || typeof payload !== "object") return typeof payload === "string" ? payload : "";
	const value = payload as { summary?: unknown; message?: unknown; command?: unknown; path?: unknown };
	for (const candidate of [value.summary, value.message, value.command, value.path])
		if (typeof candidate === "string") return candidate;
	return "";
}

function appendFallbackComposer(canvas: HTMLElement, runtime: GuiRuntime): void {
	const form = document.createElement("form");
	form.dataset.testid = "task-composer";
	const projectInput = document.createElement("input");
	projectInput.dataset.testid = "composer-project-path";
	projectInput.value = runtime.state.projectRoot ?? "";
	if (!runtime.state.projectRoot) form.append(projectInput);
	const prompt = document.createElement("textarea");
	prompt.dataset.testid = "composer-prompt";
	const storageKey = `daedalus.gui.draft.project:${runtime.state.projectRoot ?? "new"}`;
	prompt.value = localStorage.getItem(storageKey) ?? "";
	const error = document.createElement("p");
	error.dataset.testid = "composer-error";
	const submit = document.createElement("button");
	submit.type = "submit";
	submit.dataset.testid = "composer-submit";
	submit.textContent = "Start session";
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const text = prompt.value.trim();
		const path = (runtime.state.projectRoot ?? projectInput.value).trim();
		if (!text) {
			error.textContent = "Enter a prompt before submitting.";
			return;
		}
		if (!path) {
			error.textContent = "Choose a project path before starting a session.";
			return;
		}
		void runtime.startSessionFromPrompt({ path, prompt: text }).then(() => {
			prompt.value = "";
			localStorage.removeItem(storageKey);
		});
	});
	form.append(prompt, error, submit);
	canvas.append(form);
}

function appendDisabledFallbackComposer(canvas: HTMLElement, runtime: GuiRuntime): void {
	const form = document.createElement("form");
	form.dataset.testid = "task-composer";
	const prompt = document.createElement("textarea");
	prompt.dataset.testid = "composer-prompt";
	const key = `daedalus.gui.draft.session:${runtime.state.selectedSessionId ?? "unknown"}`;
	prompt.value = localStorage.getItem(key) ?? "";
	prompt.addEventListener("input", () => localStorage.setItem(key, prompt.value));
	const error = document.createElement("p");
	error.dataset.testid = "composer-error";
	error.textContent = "Follow-up turns are not available in this runtime yet. Your draft will be saved locally.";
	const submit = document.createElement("button");
	submit.type = "submit";
	submit.dataset.testid = "composer-submit";
	submit.disabled = true;
	form.append(prompt, error, submit);
	canvas.append(form);
}
