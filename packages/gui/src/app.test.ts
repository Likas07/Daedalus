import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AppServerTransport } from "@daedalus-pi/app-server-client";
import { Window } from "happy-dom";
import { createApp } from "./app";

class MemoryTransport implements AppServerTransport {
	listener: ((message: unknown) => void) | undefined;
	readonly sent: unknown[] = [];
	send(message: unknown): void {
		this.sent.push(message);
		const request = message as { kind?: string; id?: string; method?: string };
		if (request.kind === "request" && request.id)
			queueMicrotask(() =>
				this.listener?.({
					kind: "response",
					id: request.id,
					ok: true,
					result: responseFor(request.method),
				}),
			);
	}
	onMessage(listener: (message: unknown) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}
	close(): void {}
}

function responseFor(method: string | undefined): unknown {
	switch (method) {
		case "initialize":
			return { server: { name: "test", version: "0" }, capabilities: {} };
		case "project/open":
			return { projectId: "project-1" };
		case "session/start":
			return { sessionId: "session-1" };
		default:
			return {};
	}
}

let window: Window;

beforeEach(() => {
	window = new Window({ url: "http://localhost/?ws=ws://localhost/ws" });
	window.SyntaxError = SyntaxError;
	Object.assign(globalThis, {
		window,
		document: window.document,
		HTMLElement: window.HTMLElement,
		HTMLInputElement: window.HTMLInputElement,
		HTMLTextAreaElement: window.HTMLTextAreaElement,
		HTMLSelectElement: window.HTMLSelectElement,
		HTMLFormElement: window.HTMLFormElement,
		Event: window.Event,
		location: window.location,
		Node: window.Node,
		SyntaxError: window.SyntaxError ?? SyntaxError,
		localStorage: window.localStorage,
		KeyboardEvent: window.KeyboardEvent,
	});
});

afterEach(() => {
	window.close();
});

describe("GUI app", () => {
	test("approves injected extension confirm server request", async () => {
		const root = document.createElement("div");
		document.body.replaceChildren(root);
		const transport = new MemoryTransport();
		const app = await createApp({ root, transport });
		await app.start();
		transport.listener?.({
			kind: "request",
			id: "server-1",
			method: "extension/ui/request",
			params: {
				requestId: "confirm-1",
				extensionId: "test-extension",
				title: "Confirm tool call",
				description: "Approve?",
				fields: [{ id: "reason", label: "Reason", type: "text", defaultValue: "ok" }],
				actions: [
					{ id: "approve", label: "Approve", style: "primary" },
					{ id: "deny", label: "Deny" },
				],
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		root.querySelector<HTMLButtonElement>('button[data-action-id="approve"]')?.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(transport.sent).toContainEqual({
			kind: "request",
			id: "gui-2",
			method: "extension/ui/respond",
			params: { requestId: "confirm-1", actionId: "approve", values: { reason: "ok" } },
		});
		await app.close();
	});

	test("renders approval queue badges and sends approval decisions", async () => {
		const root = document.createElement("div");
		document.body.replaceChildren(root);
		const transport = new MemoryTransport();
		const app = await createApp({
			root,
			transport,
			bootstrap: { wsEndpoint: "ws://localhost/ws", projectRoot: "/repo" },
		});
		await app.start();
		transport.listener?.({
			kind: "notification",
			method: "approval/requested",
			params: {
				approvalId: "approval-1",
				sessionId: "session-1",
				summary: "Delete generated files",
				risk: "high",
				scope: "packages/gui/src",
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(root.textContent).toContain("1 approvals");
		expect(root.querySelector('[data-testid="approval-queue"]')?.textContent).toContain("Delete generated files");
		expect(root.textContent).toContain("high risk");
		expect(root.textContent).toContain("waiting approval");
		[...root.querySelectorAll<HTMLButtonElement>("button")]
			.find((button) => button.textContent?.includes("Approve once"))
			?.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(transport.sent).toContainEqual({
			kind: "request",
			id: "gui-2",
			method: "approval/respond",
			params: { approvalId: "approval-1", decision: "approved" },
		});

		transport.listener?.({
			kind: "notification",
			method: "approval/requested",
			params: {
				approvalId: "approval-2",
				sessionId: "session-1",
				summary: "Write config",
				risk: "medium",
				scope: "config",
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		[...root.querySelectorAll<HTMLButtonElement>("button")]
			.find((button) => button.textContent?.includes("Deny"))
			?.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(transport.sent).toContainEqual({
			kind: "request",
			id: "gui-3",
			method: "approval/respond",
			params: { approvalId: "approval-2", decision: "denied" },
		});
		await app.close();
	});

	test("renders quiet shell navigation without the old sidebar prompt", async () => {
		const root = document.createElement("div");
		document.body.replaceChildren(root);
		const transport = new MemoryTransport();
		const app = await createApp({
			root,
			transport,
			bootstrap: { wsEndpoint: "ws://localhost/ws", projectRoot: "/repo" },
		});
		await app.start();
		expect(root.querySelector('form[data-testid="start-session-form"]')).toBeNull();
		expect(root.textContent).toContain("Project cockpit");
		expect(root.textContent).toContain("Project overview");
		expect(root.textContent).toContain("+ New");
		app.runtime.state.sessions.push({ id: "session-1", title: "Build shell", status: "active" });
		app.runtime.notify();
		await new Promise((resolve) => setTimeout(resolve, 0));
		root.querySelector<HTMLButtonElement>("button.group")?.click();
		expect(app.runtime.state.selectedSessionId).toBe("session-1");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(root.textContent).toContain("Session workspace");
		await app.close();
	});

	test("renders compact transcript and keeps raw JSON in debug inspector", async () => {
		const root = document.createElement("div");
		document.body.replaceChildren(root);
		const transport = new MemoryTransport();
		const app = await createApp({
			root,
			transport,
			bootstrap: { wsEndpoint: "ws://localhost/ws", projectRoot: "/repo" },
		});
		await app.start();
		app.runtime.state.sessions.push({ id: "session-1", title: "Build transcript", status: "running" });
		app.runtime.notify();
		await new Promise((resolve) => setTimeout(resolve, 0));
		[...root.querySelectorAll<HTMLButtonElement>("button")]
			.find((button) => button.textContent?.includes("Build transcript"))
			?.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		app.runtime.state.events = [
			...app.runtime.state.events,
			{
				id: "event-1",
				ts: "2026-04-24T00:00:00.000Z",
				type: "tool/call",
				sessionId: "session-1",
				payload: { command: "bun test", secret: "RAW_SECRET_TRANSCRIPT_PAYLOAD" },
			},
			{
				id: "event-2",
				ts: "2026-04-24T00:00:01.000Z",
				type: "approval/requested",
				sessionId: "session-1",
				payload: { approvalId: "approval-1", summary: "Approve low-risk read" },
			},
		];
		app.runtime.notify();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(root.textContent).toContain("Tool · Call");
		expect(root.textContent).toContain("bun test");
		expect(root.textContent).toContain("Approval · Requested");
		expect(root.textContent).not.toContain("RAW_SECRET_TRANSCRIPT_PAYLOAD");
		root.querySelector<HTMLButtonElement>('[data-testid="inspector-debug-tab"]')?.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(root.querySelector('[data-testid="debug-inspector"]')?.textContent).toContain(
			"RAW_SECRET_TRANSCRIPT_PAYLOAD",
		);
		await app.close();
	});

	test("central composer opens project, starts session, and clears draft on success", async () => {
		const root = document.createElement("div");
		document.body.replaceChildren(root);
		const transport = new MemoryTransport();
		localStorage.setItem("daedalus.gui.draft.project:/repo", "Saved task");
		const app = await createApp({
			root,
			transport,
			bootstrap: { wsEndpoint: "ws://localhost/ws", projectRoot: "/repo" },
		});
		await app.start();
		await new Promise((resolve) => setTimeout(resolve, 0));
		const prompt = root.querySelector<HTMLTextAreaElement>('[data-testid="composer-prompt"]');
		expect(prompt?.value).toBe("Saved task");
		root.querySelector<HTMLButtonElement>('[data-testid="composer-submit"]')?.click();
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(transport.sent).toContainEqual({
			kind: "request",
			id: "gui-2",
			method: "project/open",
			params: { path: "/repo" },
		});
		expect(transport.sent).toContainEqual({
			kind: "request",
			id: "gui-3",
			method: "session/start",
			params: { projectId: "project-1", prompt: "Saved task" },
		});
		expect(localStorage.getItem("daedalus.gui.draft.project:/repo")).toBeNull();
		expect(prompt?.value).toBe("");
		await app.close();
	});

	test("central composer validates missing project and prompt", async () => {
		const root = document.createElement("div");
		document.body.replaceChildren(root);
		const transport = new MemoryTransport();
		const app = await createApp({ root, transport, bootstrap: { wsEndpoint: "ws://localhost/ws" } });
		await app.start();
		root.querySelector<HTMLButtonElement>('[data-testid="composer-submit"]')?.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(root.textContent).toContain("Enter a prompt before submitting.");
		const prompt = root.querySelector<HTMLTextAreaElement>('[data-testid="composer-prompt"]');
		if (!prompt) throw new Error("Missing composer prompt");
		prompt.value = "Build it";
		prompt.dispatchEvent(new Event("input", { bubbles: true }));
		root.querySelector<HTMLButtonElement>('[data-testid="composer-submit"]')?.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(root.textContent).toContain("Choose a project path before starting a session.");
		expect(transport.sent.some((message) => (message as { method?: string }).method === "session/start")).toBe(false);
		await app.close();
	});

	test("command palette opens with ctrl+k and filters to settings", async () => {
		const root = document.createElement("div");
		document.body.replaceChildren(root);
		const transport = new MemoryTransport();
		const app = await createApp({
			root,
			transport,
			bootstrap: { wsEndpoint: "ws://localhost/ws", projectRoot: "/repo" },
		});
		await app.start();
		await new Promise((resolve) => setTimeout(resolve, 0));
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(root.querySelector('[data-testid="command-palette"]')).not.toBeNull();
		const input = root.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]');
		if (!input) throw new Error("Missing command palette input");
		input.value = "settings";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(root.querySelector('[data-testid="command-palette"]')?.textContent).toContain("Open settings");
		expect(root.querySelector('[data-testid="command-palette"]')?.textContent).not.toContain("Focus composer");
		await app.close();
	});

	test("opens settings and renders provider status placeholders without server provider data", async () => {
		const root = document.createElement("div");
		document.body.replaceChildren(root);
		const transport = new MemoryTransport();
		const app = await createApp({
			root,
			transport,
			bootstrap: { wsEndpoint: "ws://localhost/ws", projectRoot: "/repo" },
		});
		await app.start();
		await new Promise((resolve) => setTimeout(resolve, 0));
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		const input = root.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]');
		if (!input) throw new Error("Missing command palette input");
		input.value = "settings";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(root.querySelector('[data-testid="settings-panel"]')).not.toBeNull();
		expect(root.textContent).toContain("Providers");
		expect(root.querySelector('[data-testid="provider-status-row"]')?.textContent).toContain("No server providers");
		expect(root.querySelector('[data-testid="provider-status-row"]')?.textContent).toContain("Model count pending");
		await app.close();
	});
});
