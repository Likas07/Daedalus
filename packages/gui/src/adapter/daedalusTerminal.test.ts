import { describe, expect, it, vi } from "vitest";
import { daedalusTerminalApi } from "./daedalusTerminal";

function createClient() {
	const listeners = new Map<string, Set<(params: never) => void>>();
	return {
		request: vi.fn(async (method: string, params: unknown) => {
			if (method === "terminal/create") {
				return {
					terminal: {
						terminalId: "term-1",
						sessionId: (params as { sessionId?: string }).sessionId,
						cwd: (params as { cwd: string }).cwd,
						shell: "/bin/zsh",
						dimensions: { cols: 100, rows: 30 },
						status: "running",
						history: "",
						cursor: { nextSeq: 1, replayCursor: 0 },
						attached: true,
						pid: 123,
						createdAt: "2026-05-04T00:00:00.000Z",
						updatedAt: "2026-05-04T00:00:00.000Z",
						elapsedMs: 0,
					},
				};
			}
			if (method === "terminal/replay") {
				return { chunks: [{ seq: 1, data: "hello" }], nextSeq: 2, replayCursor: 0, status: "running" };
			}
			return {};
		}),
		onNotification: vi.fn((method: string, listener: (params: never) => void) => {
			const set = listeners.get(method) ?? new Set();
			set.add(listener);
			listeners.set(method, set);
			return () => set.delete(listener);
		}),
		emit(method: string, params: unknown) {
			for (const listener of listeners.get(method) ?? []) listener(params as never);
		},
	};
}

describe("daedalusTerminalApi", () => {
	it("maps open/write/resize/close to Daedalus terminal requests", async () => {
		const client = createClient();
		await expect(
			daedalusTerminalApi.open(client as never, {
				threadId: "thread-1",
				terminalId: "local",
				cwd: "/repo",
				cols: 100,
				rows: 30,
			}),
		).resolves.toMatchObject({ threadId: "thread-1", terminalId: "term-1", cwd: "/repo", status: "running" });
		await daedalusTerminalApi.write(client as never, { threadId: "thread-1", terminalId: "term-1", data: "ls\n" });
		await daedalusTerminalApi.resize(client as never, {
			threadId: "thread-1",
			terminalId: "term-1",
			cols: 120,
			rows: 40,
		});
		await daedalusTerminalApi.close(client as never, { threadId: "thread-1", terminalId: "term-1" });

		expect(client.request).toHaveBeenNthCalledWith(1, "terminal/create", {
			sessionId: "thread-1",
			cwd: "/repo",
			cols: 100,
			rows: 30,
		});
		expect(client.request).toHaveBeenNthCalledWith(2, "terminal/input", { terminalId: "term-1", data: "ls\n" });
		expect(client.request).toHaveBeenNthCalledWith(3, "terminal/resize", {
			terminalId: "term-1",
			cols: 120,
			rows: 40,
		});
		expect(client.request).toHaveBeenNthCalledWith(4, "terminal/kill", { terminalId: "term-1" });
	});

	it("replays output before adapting terminal notifications", async () => {
		const client = createClient();
		const events: unknown[] = [];
		const unsubscribe = daedalusTerminalApi.subscribe(
			client as never,
			{ threadId: "thread-1", terminalId: "term-1", afterSeq: 0 },
			(event) => events.push(event),
		);
		await Promise.resolve();
		await Promise.resolve();
		client.emit("terminal/output", { terminalId: "term-1", seq: 2, data: " world" });
		client.emit("terminal/event", {
			terminalId: "term-1",
			event: { type: "exit", status: "exited", exitCode: 0, signal: null },
		});
		client.emit("terminal/closed", { terminalId: "term-1", status: "exited" });

		expect(client.request).toHaveBeenCalledWith("terminal/replay", { terminalId: "term-1", afterSeq: 0 });
		expect(events).toMatchObject([
			{ type: "output", threadId: "thread-1", terminalId: "term-1", data: "hello" },
			{ type: "output", threadId: "thread-1", terminalId: "term-1", data: " world" },
			{ type: "exited", threadId: "thread-1", terminalId: "term-1", exitCode: 0 },
			{ type: "exited", threadId: "thread-1", terminalId: "term-1", exitCode: null },
		]);
		unsubscribe();
		client.emit("terminal/output", { terminalId: "term-1", data: "ignored" });
		expect(events).toHaveLength(4);
	});

	it("disables unsupported restart and keeps clear local-only", async () => {
		const client = createClient();
		await expect(daedalusTerminalApi.restart(client as never)).resolves.toMatchObject({
			ok: false,
			capability: "terminal-restart",
		});
		await expect(
			daedalusTerminalApi.clear(client as never, { threadId: "thread-1", terminalId: "term-1" }),
		).resolves.toBeUndefined();
		expect(client.request).not.toHaveBeenCalled();
	});
});
