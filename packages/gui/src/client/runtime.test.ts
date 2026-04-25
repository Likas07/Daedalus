import { describe, expect, test } from "bun:test";
import { AppServerClient, type AppServerTransport } from "@daedalus-pi/app-server-client";
import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import { buildWsUrl, createGuiRuntime, getViteBootstrapEnv } from "./runtime";
import { statusTone } from "./view-model";

class MockTransport implements AppServerTransport {
	private listener: ((message: unknown) => void) | undefined;
	readonly sent: unknown[] = [];

	send(message: unknown): void {
		this.sent.push(message);
		if (!message || typeof message !== "object") return;
		const request = message as { kind?: string; id?: string; method?: string };
		if (request.kind !== "request" || !request.id) return;
		if (request.method === "initialize") {
			this.listener?.({ kind: "response", id: request.id, ok: true, result: { protocolVersion: "test" } });
			return;
		}
		this.listener?.({ kind: "response", id: request.id, ok: true, result: {} });
	}

	onMessage(listener: (message: unknown) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	close(): void {}

	emit(message: unknown): void {
		this.listener?.(message);
	}
}

describe("GUI runtime bootstrap", () => {
	test("buildWsUrl adds token from bootstrap", () => {
		expect(buildWsUrl({ wsEndpoint: "ws://127.0.0.1:43117/ws", token: "dev-token" })).toBe(
			"ws://127.0.0.1:43117/ws?token=dev-token",
		);
	});

	test("reads Vite app-server bootstrap fallback env", () => {
		expect(
			getViteBootstrapEnv({
				VITE_DAEDALUS_APP_SERVER_WS: "ws://127.0.0.1:43117/ws",
				VITE_DAEDALUS_APP_SERVER_TOKEN: "dev-token",
				VITE_DAEDALUS_PROJECT_ROOT: "/repo",
			}),
		).toEqual({
			wsEndpoint: "ws://127.0.0.1:43117/ws",
			endpoint: undefined,
			token: "dev-token",
			projectRoot: "/repo",
		});
	});
});

describe("GUI runtime state model", () => {
	test("upserts sessions from appended events", async () => {
		const transport = new MockTransport();
		const runtime = await createGuiRuntime({ client: new AppServerClient({ transport }) });
		await runtime.initialize();
		const event: AppEvent = {
			id: "event-1",
			type: "session/changed",
			ts: "2026-04-24T00:00:00.000Z",
			sessionId: "session-1",
			payload: { title: "Implement GUI", status: "running" },
		};

		transport.emit({ kind: "notification", method: "event/appended", params: { event } });

		expect(runtime.state.events).toEqual([event]);
		expect(runtime.state.sessions).toEqual([{ id: "session-1", title: "Implement GUI", status: "running" }]);
	});

	test("captures approvals from notifications and events", async () => {
		const transport = new MockTransport();
		const runtime = await createGuiRuntime({ client: new AppServerClient({ transport }) });
		await runtime.initialize();

		transport.emit({
			kind: "notification",
			method: "approval/requested",
			params: { approvalId: "approval-1", sessionId: "session-1", summary: "Run bun test" },
		});
		transport.emit({
			kind: "notification",
			method: "event/appended",
			params: {
				event: {
					id: "event-2",
					type: "approval/requested",
					ts: "2026-04-24T00:00:00.000Z",
					sessionId: "session-2",
					payload: { approvalId: "approval-2", request: { command: "write file" } },
				},
			},
		});

		expect(runtime.state.approvalItems).toEqual([
			{ id: "approval-2", sessionId: "session-2", summary: "write file", risk: "medium", scope: "write file" },
			{ id: "approval-1", sessionId: "session-1", summary: "Run bun test", risk: "low", scope: "Run bun test" },
		]);
	});

	test("sends approval response requests", async () => {
		const transport = new MockTransport();
		const runtime = await createGuiRuntime({ client: new AppServerClient({ transport }) });
		await runtime.initialize();
		await runtime.respondToApproval("approval-1", "denied");
		expect(transport.sent).toContainEqual({
			kind: "request",
			id: "client-2",
			method: "approval/respond",
			params: { approvalId: "approval-1", decision: "denied" },
		});
	});

	test("selects and clears the selected session", async () => {
		const runtime = await createGuiRuntime({
			bootstrap: { wsEndpoint: "ws://127.0.0.1:43117/ws" },
			transport: new MockTransport(),
		});

		runtime.selectSession("session-1");
		expect(runtime.state.selectedSessionId).toBe("session-1");

		runtime.selectSession();
		expect(runtime.state.selectedSessionId).toBeUndefined();
	});

	test("maps statuses to renderer tones", () => {
		expect(statusTone("running")).toBe("info");
		expect(statusTone("waiting_for_approval")).toBe("warning");
		expect(statusTone("failed")).toBe("danger");
		expect(statusTone("done")).toBe("success");
		expect(statusTone(undefined)).toBe("muted");
	});
});
