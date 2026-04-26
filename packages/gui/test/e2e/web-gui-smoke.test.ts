import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppServerInstance, startAppServer } from "@daedalus-pi/app-server";
import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import type { RuntimeFactory } from "@daedalus-pi/app-server/src/runtime/session-controller";
import type { PtyAdapter } from "@daedalus-pi/app-server/src/terminal/pty-adapter";

const runtimeFactory: RuntimeFactory = async (input) => ({
	cwd: input.cwd,
	session: {
		subscribe: () => () => {},
		async prompt() {},
		async abort() {},
	},
	control: {
		readState: () => ({ status: "idle" }),
		async setModel() {},
		async setThinking() {},
	},
	async applyRuntimeOptions() {},
	async dispose() {},
});

const terminalPty: PtyAdapter = {
	spawn: () => {
		let dataListener: ((data: string) => void) | undefined;
		return {
			pid: 1,
			write: (data) => dataListener?.(data),
			resize: () => {},
			kill: () => {},
			onData: (listener) => {
				dataListener = listener;
				return () => {
					dataListener = undefined;
				};
			},
			onExit: () => () => {},
		};
	},
};

async function git(cwd: string, ...args: string[]): Promise<void> {
	const proc = Bun.spawn(["git", ...args], { cwd, stdout: "ignore", stderr: "ignore" });
	if ((await proc.exited) !== 0) throw new Error(`git ${args.join(" ")} failed`);
}

function waitForOpen(socket: WebSocket): Promise<void> {
	return new Promise((resolve, reject) => {
		socket.addEventListener("open", () => resolve(), { once: true });
		socket.addEventListener("error", () => reject(new Error("websocket failed to open")), { once: true });
	});
}

function waitForClose(socket: WebSocket): Promise<CloseEvent> {
	return new Promise((resolve) => socket.addEventListener("close", (event) => resolve(event), { once: true }));
}

function request(server: AppServerInstance, method: string, params: Record<string, unknown> = {}) {
	return server.router.handle({ kind: "request", id: `${method}-smoke`, method, params } as never);
}

describe("web GUI E2E smoke", () => {
	let server: AppServerInstance | undefined;
	let tempDir: string | undefined;

	afterEach(async () => {
		await server?.stop();
		server = undefined;
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	});

	test("serves daedalus gui --no-open readiness and rejects or accepts tokens", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "daedalus-web-gui-smoke-"));
		server = await startAppServer({
			databasePath: join(tempDir, "app.sqlite"),
			token: "smoke-token",
			serveGui: true,
			projectRoot: tempDir,
			runtimeFactory,
		});

		expect(await (await fetch(`${server.httpUrl}/health`)).json()).toEqual({ ok: true });
		const bootstrap = await (await fetch(`${server.httpUrl}/api/gui/bootstrap?token=smoke-token`)).json();
		expect(bootstrap).toMatchObject({ token: "smoke-token", projectRoot: tempDir });

		const rejected = new WebSocket(`${server.wsUrl}?token=wrong-token`);
		expect((await waitForClose(rejected)).code).toBeGreaterThan(0);

		const accepted = new WebSocket(`${server.wsUrl}?token=smoke-token`);
		await waitForOpen(accepted);
		accepted.close();
	});

	test("opens project, starts SQLite session, exercises GUI parity protocol, and replays reconnect events", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "daedalus-web-gui-smoke-"));
		writeFileSync(join(tempDir, "file.txt"), "before\n");
		await git(tempDir, "init");
		await git(tempDir, "config", "user.email", "smoke@example.invalid");
		await git(tempDir, "config", "user.name", "GUI Smoke");
		await git(tempDir, "add", "file.txt");
		await git(tempDir, "commit", "-m", "initial");
		writeFileSync(join(tempDir, "file.txt"), "after\n");
		server = await startAppServer({
			databasePath: join(tempDir, "app.sqlite"),
			agentDir: join(tempDir, "agent"),
			runtimeFactory,
			terminalPty,
		});

		const init = await request(server, "initialize", { protocolVersion: "1", client: { name: "web-gui-smoke" } });
		expect(init).toMatchObject({ capabilities: expect.any(Object) });

		const opened = (await request(server, "project/open", { path: tempDir })) as { projectId: string };
		expect(opened.projectId).toBeTruthy();

		const commands = (await request(server, "composer/command-list", {})) as { commands: unknown[] };
		expect(commands.commands.length).toBeGreaterThan(0);

		const session = { sessionId: "web-gui-smoke-session" };
		const started: AppEvent = {
			id: "web-smoke-session-started",
			type: "session/started",
			ts: new Date(0).toISOString(),
			sessionId: session.sessionId,
			payload: {
				sessionId: session.sessionId,
				projectId: opened.projectId,
				cwd: tempDir,
				title: "SQLite-backed GUI smoke session",
			},
		};
		server.router.append(started);
		const sessionList = (await request(server, "session/list", { cwd: tempDir })) as {
			sessions: unknown[];
		};
		expect(sessionList.sessions).toBeDefined();

		const composerStarted = (await request(server, "session/start", {
			projectId: opened.projectId,
			prompt: "Enter-to-send E2E prompt",
			filePaths: ["file.txt"],
			model: "smoke-model",
			effort: "high",
			accessMode: "supervised",
			mode: "daedalus",
			fastMode: false,
			draftState: { prompt: "Enter-to-send E2E prompt", mode: "build" },
		})) as { sessionId: string };
		expect(composerStarted.sessionId).toBeTruthy();

		expect(await request(server, "auth/status", {})).toHaveProperty("providers");
		const terminal = (await request(server, "terminal/create", { cwd: tempDir, projectId: opened.projectId, sessionId: session.sessionId, cols: 80, rows: 24 })) as {
			terminal: { terminalId: string; projectId?: string; sessionId?: string; cwd?: string };
		};
		expect(typeof terminal.terminal.terminalId).toBe("string");
		expect(terminal.terminal.projectId).toBe(opened.projectId);
		expect(terminal.terminal.sessionId).toBe(session.sessionId);
		expect(terminal.terminal.cwd).toBe(tempDir);
		expect(
			await request(server, "terminal/input", {
				terminalId: terminal.terminal.terminalId,
				data: "echo daedalus-gui-smoke\n",
			}),
		).toEqual({});
		const terminalReplay = (await request(server, "terminal/replay", { terminalId: terminal.terminal.terminalId, afterSeq: 0 })) as { chunks: Array<{ seq: number; data: string }> };
		const replayAgain = (await request(server, "terminal/replay", { terminalId: terminal.terminal.terminalId, afterSeq: terminalReplay.chunks.at(-1)?.seq ?? 0 })) as { chunks: Array<{ seq: number; data: string }> };
		expect(terminalReplay.chunks.map((chunk) => chunk.data)).toEqual(["echo daedalus-gui-smoke\n"]);
		expect(replayAgain.chunks).toEqual([]);
		await expect(request(server, "terminal/create", { cwd: join(tempDir, "missing"), projectId: opened.projectId, cols: 80, rows: 24 })).rejects.toThrow();

		const diff = (await request(server, "diff/get", { diffId: opened.projectId })) as { diff: { files: unknown[] } };
		expect(diff.diff.files).toBeDefined();

		const exported = (await request(server, "diagnostics/export", { kind: "support-bundle" })) as {
			filename: string;
			content: string;
		};
		expect(exported.filename).toContain("daedalus-support");
		expect(exported.content).toContain("runtimeDiagnostics");

		const replayEvent: AppEvent = {
			id: "web-smoke-replay",
			type: "session/started",
			ts: new Date(0).toISOString(),
			sessionId: session.sessionId,
			payload: { sessionId: session.sessionId, projectId: opened.projectId, title: "Replay" },
		};
		server.router.append(replayEvent);
		const replay = (await request(server, "event/replay", { types: ["session/started"], cursor: { after: 0 } })) as {
			events: AppEvent[];
		};
		expect(replay.events.some((event) => event.id === replayEvent.id)).toBe(true);
	});
});
