import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppServerInstance, ExtensionUIBridge, startAppServer } from "@daedalus-pi/app-server";
import type { AppEvent, ExtensionUiRequest } from "@daedalus-pi/app-server-protocol";
import { renderExtensionDialogs } from "../../../gui/src/components/extension-dialogs";

class TestElement {
	children: TestElement[] = [];
	dataset: Record<string, string> = {};
	className = "";
	textContent = "";
	innerHTML = "";
	name = "";
	type = "";
	value = "";
	checked = false;
	required = false;
	private listeners = new Map<string, (() => void)[]>();
	constructor(readonly tagName: string) {}
	append(...nodes: TestElement[]): void {
		this.children.push(...nodes);
	}
	replaceChildren(...nodes: TestElement[]): void {
		this.children = nodes;
	}
	setAttribute(name: string, value: string): void {
		(this as unknown as Record<string, string>)[name] = value;
	}
	addEventListener(type: string, listener: () => void): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}
	click(): void {
		for (const listener of this.listeners.get("click") ?? []) listener();
	}
	querySelector<T>(selector: string): T | null {
		const match = selector.match(/^button\[data-action-id="(.+)"\]$/);
		if (!match) return null;
		return (
			(this.walk().find((node) => node.tagName === "button" && node.dataset.actionId === match[1]) as
				| T
				| undefined) ?? null
		);
	}
	get elements(): { namedItem(name: string): TestElement | null } {
		return { namedItem: (name) => this.walk().find((node) => node.name === name) ?? null };
	}
	private walk(): TestElement[] {
		return [this, ...this.children.flatMap((child) => child.walk())];
	}
}

class TestDocument {
	createElement(tagName: string): TestElement {
		return new TestElement(tagName);
	}
}

Object.assign(globalThis, { document: new TestDocument(), HTMLInputElement: TestElement });

describe("desktop GUI smoke without Electron display", () => {
	let server: AppServerInstance | undefined;
	let tempDir: string | undefined;
	afterEach(async () => {
		await server?.stop();
		server = undefined;
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	});

	// CI may not provide a graphical display or Electron sandbox. This smoke test
	// validates the integration seams Electron bootstraps: app-server readiness,
	// GUI extension dialog response plumbing, and persisted event replay.
	test("starts app-server, renders extension dialog path, and persists replayable events", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "daedalus-gui-smoke-"));
		server = await startAppServer({ databasePath: join(tempDir, "app.sqlite"), agentDir: join(tempDir, "agent") });

		const health = await fetch(new URL("/health", server.httpUrl));
		expect(health.ok).toBe(true);
		expect(await health.json()).toEqual({ ok: true });

		const init = await server.router.handle({
			kind: "request",
			id: "init-1",
			method: "initialize",
			params: { protocolVersion: "1", client: { name: "desktop-smoke" } },
		});
		expect(init).toMatchObject({ server: { name: "daedalus-app-server" }, capabilities: { extensions: true } });

		const emitted: unknown[] = [];
		const bridge = new ExtensionUIBridge({
			extensionId: "smoke.extension",
			sessionId: "session-smoke",
			nextRequestId: () => "request-smoke",
			emit: (message) => emitted.push(message),
		});
		const pending = bridge.editor("Smoke input", "persist-me");
		await Promise.resolve();

		const uiRequest = emitted[0] as { params: ExtensionUiRequest };
		const dialog = renderExtensionDialogs([uiRequest.params], (request, actionId, values) => {
			expect(bridge.respond({ requestId: request.requestId, actionId, values })).toBe(true);
		});
		dialog.querySelector<HTMLButtonElement>('button[data-action-id="submit"]')?.click();
		expect(await pending).toBe("persist-me");

		const event: AppEvent = {
			id: "event-smoke",
			type: "extension.ui.completed",
			ts: new Date(0).toISOString(),
			sessionId: "session-smoke",
			payload: { requestId: "request-smoke" },
		};
		server.router.append(event);
		const replay = await server.router.handle({
			kind: "request",
			id: "replay-1",
			method: "event/replay",
			params: { types: ["extension.ui.completed"] },
		});
		expect(replay).toMatchObject({ events: [event] });

		await expect(
			server.router.handle({
				kind: "request",
				id: "unsafe-start",
				method: "session/start",
				params: { projectId: "project-smoke", prompt: "must not bypass validation" },
			}),
		).rejects.toThrow("session/start requires explicit startTarget");
	});
});
