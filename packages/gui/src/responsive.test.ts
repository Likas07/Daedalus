import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AppServerTransport } from "@daedalus-pi/app-server-client";
import { Window } from "happy-dom";
type CreateApp = typeof import("./app")["createApp"];

class MemoryTransport implements AppServerTransport {
	listener: ((message: unknown) => void) | undefined;
	readonly sent: unknown[] = [];
	send(message: unknown): void {
		this.sent.push(message);
		const request = message as { kind?: string; id?: string; method?: string; params?: unknown };
		if (request.kind === "request" && request.id)
			queueMicrotask(() => this.listener?.({ kind: "response", id: request.id, ok: true, result: responseFor(request.method, request) }));
	}
	onMessage(listener: (message: unknown) => void): () => void {
		this.listener = listener;
		return () => { this.listener = undefined; };
	}
	close(): void {}
}

function responseFor(method: string | undefined, request?: { params?: unknown }): unknown {
	switch (method) {
		case "initialize": return { server: { name: "test", version: "0" }, capabilities: {} };
		case "project/list": return { projects: [] };
		case "session/list": return { sessions: [] };
		case "terminal/list": return { terminals: [] };
		case "model/list": return { models: [], selectedModel: undefined };
		case "auth/status": return { providers: [] };
		case "config/get": return { config: {} };
		case "access/get":
		case "access/set": {
			const mode = (request?.params as { mode?: string } | undefined)?.mode ?? "supervised";
			return { policy: { mode, autoApproveSoftPrompts: mode !== "supervised", bypassHardBlocks: false, auditRequired: true } };
		}
		case "composer/file-search": return { files: [{ path: "src/App.svelte", label: "App.svelte", kind: "file", extension: "svelte" }] };
		case "composer/command-list": return { commands: [{ name: "plan", label: "Plan", description: "Plan first", source: "core" }] };
		case "event/replay": return { events: [] };
		default: return {};
	}
}

let window: Window;

function setViewport(width: number): void {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
	window.dispatchEvent(new window.Event("resize"));
}

beforeEach(() => {
	window = new Window({ url: "http://localhost/?ws=ws://localhost/ws" });
	window.SyntaxError = SyntaxError;
	Object.assign(globalThis, {
		window,
		document: window.document,
		HTMLElement: window.HTMLElement,
		Element: window.Element,
		SVGElement: window.SVGElement,
		HTMLInputElement: window.HTMLInputElement,
		HTMLTextAreaElement: window.HTMLTextAreaElement,
		HTMLSelectElement: window.HTMLSelectElement,
		HTMLFormElement: window.HTMLFormElement,
		Event: window.Event,
		location: window.location,
		Node: window.Node,
		Text: window.Text,
		Comment: window.Comment,
		SyntaxError: window.SyntaxError ?? SyntaxError,
		localStorage: window.localStorage,
		KeyboardEvent: window.KeyboardEvent,
	});
});

afterEach(() => { window.close(); });

async function loadCreateApp(): Promise<CreateApp> {
	return (await import(`./app?test=${Date.now()}-${Math.random()}`)).createApp;
}

describe("GUI responsive policy", () => {
	test("marks the fallback renderer so it cannot masquerade as the primary shell", async () => {
		setViewport(1024);
		const root = document.createElement("div");
		document.body.replaceChildren(root);
		const app = await (await loadCreateApp())({ root, transport: new MemoryTransport(), bootstrap: { wsEndpoint: "ws://localhost/ws", projectRoot: "/repo" } });
		await app.start();
		expect(root.querySelector('[data-testid="gui-fallback-renderer"]')).not.toBeNull();
		expect(root.querySelector('[data-testid="test-renderer-shim"]')).toBeNull();
		await app.close();
	});

	test("closes the right inspector below tablet width", async () => {
		setViewport(700);
		const root = document.createElement("div");
		document.body.replaceChildren(root);
		const app = await (await loadCreateApp())({ root, transport: new MemoryTransport(), bootstrap: { wsEndpoint: "ws://localhost/ws", projectRoot: "/repo" } });
		await app.start();
		expect(root.textContent).toContain("Project overview");
		expect(root.querySelector('[aria-label="Inspector drawer"]')).toBeNull();
		await app.close();
	});

	test("closes both side panes at phone width but keeps core surfaces available", async () => {
		setViewport(390);
		const root = document.createElement("div");
		document.body.replaceChildren(root);
		const app = await (await loadCreateApp())({ root, transport: new MemoryTransport(), bootstrap: { wsEndpoint: "ws://localhost/ws", projectRoot: "/repo" } });
		await app.start();
		expect(root.textContent).toContain("Project cockpit");
		expect(root.querySelector('[data-testid="terminal-tail"]')).not.toBeNull();
		expect(root.querySelector('[aria-label="Inspector drawer"]')).toBeNull();
		expect(root.textContent).not.toContain("Project overview");
		await app.close();
	});
});
