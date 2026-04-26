import { describe, expect, test } from "bun:test";
import type { PtyAdapter } from "./pty-adapter";
import { TerminalService } from "./terminal-service";

function fakePty() {
	let onData: (data: string) => void = () => {};
	let onExit: (event: { exitCode: number | null; signal: string | null }) => void = () => {};
	const writes: string[] = [];
	const resizes: Array<[number, number]> = [];
	const kills: Array<string | undefined> = [];
	const adapter: PtyAdapter = {
		spawn: () => ({
			pid: 123,
			write: (data) => writes.push(data),
			resize: (cols, rows) => resizes.push([cols, rows]),
			kill: (signal) => {
				kills.push(signal);
				onExit({ exitCode: null, signal: signal ?? null });
			},
			onData: (listener) => {
				onData = listener;
				return () => {};
			},
			onExit: (listener) => {
				onExit = listener;
				return () => {};
			},
		}),
	};
	return {
		adapter,
		writes,
		resizes,
		kills,
		emitData: (data: string) => onData(data),
		emitExit: (exitCode: number | null, signal: string | null = null) => onExit({ exitCode, signal }),
	};
}

describe("TerminalService", () => {
	test("write, resize, close, replay, and history use the fake PTY", async () => {
		const pty = fakePty();
		const notifications: unknown[] = [];
		const service = new TerminalService({
			pty: pty.adapter,
			publish: (message) => notifications.push(message),
			maxScrollbackChunks: 10,
		});
		const terminal = await service.create({ cwd: "/tmp", shell: "/bin/sh" });
		pty.emitData("one\n");
		expect(service.detach(terminal.terminalId).attached).toBe(false);
		pty.emitData("two\n");
		service.input(terminal.terminalId, "echo ok\n");
		expect(pty.writes).toEqual(["echo ok\n"]);
		expect(service.resize(terminal.terminalId, { cols: 120, rows: 40 }).dimensions).toEqual({ cols: 120, rows: 40 });
		expect(pty.resizes).toEqual([[120, 40]]);
		expect(service.replay(terminal.terminalId, 1).chunks.map((chunk) => chunk.data)).toEqual(["two\n"]);
		const attached = service.attach(terminal.terminalId);
		expect(attached.history).toBe("one\ntwo\n");
		pty.emitData("three\n");
		expect(service.replay(terminal.terminalId, 0).chunks.map((chunk) => chunk.data)).toEqual([
			"one\n",
			"two\n",
			"three\n",
		]);
		const killed = service.kill(terminal.terminalId);
		expect(killed.status).toBe("killed");
		expect(pty.kills).toEqual([undefined]);
		expect(() => service.input(terminal.terminalId, "after\n")).toThrow();
		expect(notifications).toContainEqual({
			kind: "notification",
			method: "terminal/event",
			params: { terminalId: terminal.terminalId, event: { type: "output", seq: 1, data: "one\n" } },
		});
	});

	test("caps replay buffer and history by byte and line limits", async () => {
		const pty = fakePty();
		const service = new TerminalService({
			pty: pty.adapter,
			maxScrollbackChunks: 10,
			maxHistoryBytes: 8,
			maxHistoryLines: 2,
		});
		const terminal = await service.create({ cwd: "/tmp", shell: "/bin/sh" });
		pty.emitData("one\n");
		pty.emitData("two\n");
		pty.emitData("three\n");
		const snapshot = service.attach(terminal.terminalId);
		expect(snapshot.history).toBe("three\n");
		expect(
			service
				.replay(terminal.terminalId, 0)
				.chunks.map((chunk) => chunk.data)
				.join(""),
		).toBe("three\n");
	});
});
