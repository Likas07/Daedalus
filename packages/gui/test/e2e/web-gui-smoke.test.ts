import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppServerInstance, startAppServer } from "@daedalus-pi/app-server";
import type { CommandRunner } from "@daedalus-pi/app-server/src/integrations/integration-api";
import type { RuntimeFactory } from "@daedalus-pi/app-server/src/runtime/session-controller";
import type { PtyAdapter } from "@daedalus-pi/app-server/src/terminal/pty-adapter";
import type { AppEvent } from "@daedalus-pi/app-server-protocol";

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

const integrationRunner: CommandRunner = async (args) => {
	const command = args.join(" ");
	if (command === "gh --version") return { stdout: "gh version smoke", exitCode: 0 };
	if (command === "gh auth status") return { stdout: "Logged in", exitCode: 0 };
	if (command === "gh repo view --json owner,name,url")
		return {
			stdout: JSON.stringify({
				owner: { login: "daedalus" },
				name: "gui-smoke",
				url: "https://github.invalid/daedalus/gui-smoke",
			}),
			exitCode: 0,
		};
	if (command.startsWith("gh issue list")) return { stdout: "[]", exitCode: 0 };
	if (command.startsWith("gh pr list")) return { stdout: "[]", exitCode: 0 };
	if (command.startsWith("gh pr create"))
		return {
			stdout: JSON.stringify({ number: 42, url: "https://github.invalid/daedalus/gui-smoke/pull/42" }),
			exitCode: 0,
		};
	if (command.startsWith("gh browse")) return { stdout: "", exitCode: 0 };
	return { stderr: `unexpected command: ${command}`, exitCode: 1 };
};

async function git(cwd: string, ...args: string[]): Promise<void> {
	const proc = Bun.spawn(["git", ...args], { cwd, stdout: "ignore", stderr: "pipe" });
	if ((await proc.exited) !== 0)
		throw new Error(`git ${args.join(" ")} failed: ${await new Response(proc.stderr).text()}`);
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
	return server.router.handle({
		kind: "request",
		id: `${method}-smoke-${crypto.randomUUID()}`,
		method,
		params,
	} as never);
}

async function approveNext(server: AppServerInstance): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt++) {
		const approvals = (await request(server, "approval/list", {})) as {
			approvals?: Array<{ id: string; approvalId?: string }>;
		};
		const approval = approvals.approvals?.at(0);
		const replay = (await request(server, "event/replay", {
			types: ["approval/requested"],
			cursor: { after: 0 },
		})) as {
			events?: Array<{ payload?: { approvalId?: string } }>;
		};
		const approvalId = approval?.approvalId ?? approval?.id ?? replay.events?.at(-1)?.payload?.approvalId;
		if (approvalId) {
			await request(server, "approval/respond", { approvalId, decision: "approved", reason: "E2E smoke approval" });
			return;
		}
		await Bun.sleep(10);
	}
	throw new Error("Timed out waiting for approval");
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

	test("serves daedalus gui --no-open readiness, sidebar bootstrap, and token-gated websocket", async () => {
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

	test("covers full temp-project user journey, terminal/git/settings/PR diagnostics, and restart hydration", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "daedalus-web-gui-smoke-"));
		writeFileSync(join(tempDir, "file.txt"), "before\n");
		writeFileSync(join(tempDir, "discard.txt"), "keep\n");
		await git(tempDir, "init");
		await git(tempDir, "config", "user.email", "smoke@example.invalid");
		await git(tempDir, "config", "user.name", "GUI Smoke");
		await git(tempDir, "add", "file.txt", "discard.txt");
		await git(tempDir, "commit", "-m", "initial");
		writeFileSync(join(tempDir, "file.txt"), "after\n");
		writeFileSync(join(tempDir, "discard.txt"), "discard me\n");
		const databasePath = join(tempDir, "app.sqlite");
		server = await startAppServer({
			databasePath,
			agentDir: join(tempDir, "agent"),
			runtimeFactory,
			terminalPty,
			integrationRunner,
		});

		const init = await request(server, "initialize", { protocolVersion: "1", client: { name: "web-gui-smoke" } });
		expect(init).toMatchObject({ capabilities: expect.any(Object) });

		const opened = (await request(server, "project/open", { path: tempDir })) as { projectId: string };
		expect(opened.projectId).toBeTruthy();
		expect(((await request(server, "project/list", {})) as { projects: unknown[] }).projects.length).toBeGreaterThan(
			0,
		);
		expect(
			((await request(server, "composer/command-list", {})) as { commands: unknown[] }).commands.length,
		).toBeGreaterThan(0);

		const composerStarted = (await request(server, "session/start", {
			projectId: opened.projectId,
			startTarget: {
				mode: "base-checkout",
				projectId: opened.projectId,
				confirmation: { confirmed: true, evidence: "web GUI smoke uses the temp project checkout" },
			},
			prompt: "Enter-to-send E2E prompt",
			filePaths: ["file.txt"],
			model: "smoke-model",
			effort: "high",
			accessMode: "supervised",
			mode: "daedalus",
			fastMode: false,
			draftState: { prompt: "Enter-to-send E2E prompt", mode: "build", submittedBy: "enter" },
		})) as { sessionId: string };
		expect(composerStarted.sessionId).toBeTruthy();
		expect(
			((await request(server, "session/list", { cwd: tempDir })) as { sessions: unknown[] }).sessions,
		).toBeDefined();

		const shellProjection = (await request(server, "shell/snapshot", { projectId: opened.projectId })) as {
			snapshot: {
				selectedThreadId?: string;
				threads: Array<{ threadId: string; sessionId?: string; safetySignals?: unknown[] }>;
			};
		};
		expect(shellProjection.snapshot.threads).toEqual(
			expect.arrayContaining([expect.objectContaining({ threadId: composerStarted.sessionId })]),
		);
		const threadProjection = (await request(server, "thread/snapshot", { threadId: composerStarted.sessionId })) as {
			snapshot: {
				threadId: string;
				sessionId: string;
				messages: Array<{ role: string; content: string }>;
				pendingActions: unknown[];
				safetySignals: unknown[];
			};
		};
		expect(threadProjection.snapshot).toMatchObject({
			threadId: composerStarted.sessionId,
			sessionId: composerStarted.sessionId,
		});
		expect(threadProjection.snapshot.messages).toEqual(
			expect.arrayContaining([expect.objectContaining({ role: "user", content: "Enter-to-send E2E prompt" })]),
		);
		expect(threadProjection.snapshot.pendingActions).toBeDefined();
		expect(threadProjection.snapshot.safetySignals).toBeDefined();

		expect(await request(server, "auth/status", {})).toHaveProperty("providers");
		const modelList = (await request(server, "model/list", {})) as { models: unknown[]; selectedModel?: string };
		expect(modelList.models).toBeDefined();
		expect(await request(server, "settings/set", { scope: "global", key: "theme", value: "dark" })).toHaveProperty(
			"effective",
		);
		expect(await request(server, "settings/read", {})).toHaveProperty("effective");

		const terminal = (await request(server, "terminal/create", {
			cwd: tempDir,
			projectId: opened.projectId,
			sessionId: composerStarted.sessionId,
			cols: 80,
			rows: 24,
		})) as { terminal: { terminalId: string; projectId?: string; sessionId?: string; cwd?: string } };
		expect(terminal.terminal).toMatchObject({
			projectId: opened.projectId,
			sessionId: composerStarted.sessionId,
			cwd: tempDir,
		});
		expect(
			await request(server, "terminal/input", {
				terminalId: terminal.terminal.terminalId,
				data: "echo daedalus-gui-smoke\n",
			}),
		).toEqual({});
		const terminalReplay = (await request(server, "terminal/replay", {
			terminalId: terminal.terminal.terminalId,
			afterSeq: 0,
		})) as { chunks: Array<{ seq: number; data: string }> };
		expect(terminalReplay.chunks.map((chunk) => chunk.data)).toEqual(["echo daedalus-gui-smoke\n"]);
		expect(
			((await request(server, "terminal/list", { projectId: opened.projectId })) as { terminals: unknown[] })
				.terminals.length,
		).toBeGreaterThan(0);

		expect(await request(server, "access/set", { mode: "unrestricted" })).toMatchObject({
			policy: { mode: "unrestricted" },
		});
		expect(
			((await request(server, "diff/get", { diffId: opened.projectId })) as { diff: { files: unknown[] } }).diff
				.files.length,
		).toBeGreaterThan(0);
		expect(await request(server, "git/stage", { diffId: opened.projectId, paths: ["file.txt"] })).toMatchObject({
			ok: true,
		});
		expect(await request(server, "git/unstage", { diffId: opened.projectId, paths: ["file.txt"] })).toMatchObject({
			ok: true,
		});
		expect(await request(server, "git/stage", { diffId: opened.projectId, paths: ["file.txt"] })).toMatchObject({
			ok: true,
		});
		const commitPromise = request(server, "git/commit", { diffId: opened.projectId, message: "GUI smoke commit" });
		await approveNext(server);
		expect(await commitPromise).toMatchObject({ ok: true });
		const discardPromise = request(server, "git/discard", { diffId: opened.projectId, paths: ["discard.txt"] });
		await approveNext(server);
		expect(await discardPromise).toMatchObject({ ok: true });
		expect(readFileSync(join(tempDir, "discard.txt"), "utf8")).toBe("keep\n");

		const checkpoint = (await request(server, "checkpoint/create", {
			sessionId: composerStarted.sessionId,
			turnId: "turn-smoke",
			label: "Smoke checkpoint",
		})) as { checkpoint: { checkpointId: string } };
		expect(checkpoint.checkpoint.checkpointId).toBeTruthy();
		expect(
			(
				(await request(server, "checkpoint/list", { sessionId: composerStarted.sessionId })) as {
					checkpoints: unknown[];
				}
			).checkpoints.length,
		).toBeGreaterThan(0);

		expect(await request(server, "integration/list", { projectId: opened.projectId })).toHaveProperty("integrations");
		const prPromise = request(server, "integration/pr-create", {
			provider: "github",
			projectId: opened.projectId,
			title: "GUI smoke PR",
			head: "main",
			base: "main",
			body: "mock",
		});
		await approveNext(server);
		expect(await prPromise).toMatchObject({ pullRequest: { status: "created", number: 42 } });
		expect(
			await request(server, "integration/pr-open", {
				provider: "github",
				projectId: opened.projectId,
				url: "https://github.invalid/daedalus/gui-smoke/pull/42",
			}),
		).toEqual({ ok: true });

		const exported = (await request(server, "diagnostics/export", { kind: "support-bundle" })) as {
			filename: string;
			content: string;
		};
		expect(exported.filename).toContain("daedalus-support");
		expect(exported.content).toContain("runtimeDiagnostics");
		const replay = (await request(server, "event/replay", { cursor: { after: 0 } })) as { events: AppEvent[] };
		expect(replay.events.some((event) => event.type === "session/started")).toBe(true);

		await server.stop();
		server = await startAppServer({
			databasePath,
			agentDir: join(tempDir, "agent"),
			runtimeFactory,
			terminalPty,
			integrationRunner,
		});
		expect(existsSync(databasePath)).toBe(true);
		expect(((await request(server, "project/list", {})) as { projects: unknown[] }).projects).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: opened.projectId })]),
		);
		expect(
			((await request(server, "terminal/list", { projectId: opened.projectId })) as { terminals: unknown[] })
				.terminals,
		).toEqual(expect.arrayContaining([expect.objectContaining({ terminalId: terminal.terminal.terminalId })]));
		expect(await request(server, "settings/read", {})).toHaveProperty("effective");
	});

	test("preserves M3 session lineage, worktree target, active selection, and restoration diagnostics across restart", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "daedalus-web-gui-continuity-"));
		writeFileSync(join(tempDir, "README.md"), "# continuity\n");
		await git(tempDir, "init");
		await git(tempDir, "config", "user.email", "continuity@example.invalid");
		await git(tempDir, "config", "user.name", "GUI Continuity");
		await git(tempDir, "add", "README.md");
		await git(tempDir, "commit", "-m", "initial");
		const databasePath = join(tempDir, "app.sqlite");
		const agentDir = join(tempDir, "agent");
		server = await startAppServer({ databasePath, agentDir, runtimeFactory });

		const opened = (await request(server, "project/open", { path: tempDir })) as { projectId: string };
		const source = (await request(server, "session/start", {
			projectId: opened.projectId,
			startTarget: {
				mode: "base-checkout",
				projectId: opened.projectId,
				confirmation: { confirmed: true, evidence: "continuity E2E source session uses base checkout" },
			},
			prompt: "source continuity thread",
			operationId: "m3-continuity-source",
		})) as { sessionId: string; runsIn: { isolationMode?: string; projectId?: string } };
		expect(source.runsIn).toMatchObject({ projectId: opened.projectId, isolationMode: "base-checkout" });

		const continued = (await request(server, "session/continue-in-worktree", {
			sourceSessionId: source.sessionId,
			projectId: opened.projectId,
			branch: "m3-continuity-worktree",
			prompt: "continue continuity in worktree",
			operationId: "m3-continuity-continue",
		})) as {
			sessionId: string;
			parentSessionId: string;
			worktree: { id: string; path: string; branch: string };
			runsIn: {
				projectId?: string;
				worktreeId?: string;
				path?: string;
				canonicalPath?: string;
				branch?: string;
				isolationMode?: string;
				validationStatus?: string;
			};
		};
		expect(continued.parentSessionId).toBe(source.sessionId);
		expect(continued.runsIn).toMatchObject({
			projectId: opened.projectId,
			worktreeId: continued.worktree.id,
			branch: "m3-continuity-worktree",
			isolationMode: "isolated-worktree",
			validationStatus: "valid",
		});
		expect(continued.runsIn.path ?? continued.runsIn.canonicalPath).toBe(continued.worktree.path);

		expect(
			await request(server, "workspace/selection/set", {
				projectId: opened.projectId,
				sessionId: continued.sessionId,
			}),
		).toMatchObject({
			selection: { projectId: opened.projectId, sessionId: continued.sessionId },
			restorationTrace: { status: "restored", resolvedSession: continued.sessionId },
		});

		await server.stop();
		server = await startAppServer({ databasePath, agentDir, runtimeFactory });
		expect(existsSync(databasePath)).toBe(true);

		const sourceSessionsAfterRestart = (await request(server, "session/list", { cwd: tempDir })) as {
			sessions: Array<{ id: string }>;
		};
		expect(sourceSessionsAfterRestart.sessions).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: source.sessionId })]),
		);
		const childSessionsAfterRestart = (await request(server, "session/list", { cwd: continued.worktree.path })) as {
			sessions: Array<{ id: string; parentSessionPath?: string }>;
		};
		expect(childSessionsAfterRestart.sessions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: continued.sessionId, parentSessionPath: source.sessionId }),
			]),
		);

		const restoredSelection = await request(server, "workspace/selection/get", { projectId: opened.projectId });
		expect(restoredSelection).toMatchObject({
			selection: { projectId: opened.projectId, sessionId: continued.sessionId },
			degraded: false,
			restorationTrace: { status: "restored", resolvedSession: continued.sessionId },
		});

		const replay = (await request(server, "event/replay", { types: ["session/started"], cursor: { after: 0 } })) as {
			events: AppEvent[];
		};
		expect(replay.events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ payload: expect.objectContaining({ sessionId: source.sessionId }) }),
				expect.objectContaining({
					payload: expect.objectContaining({ sessionId: continued.sessionId, parentSessionId: source.sessionId }),
				}),
			]),
		);

		const exported = (await request(server, "diagnostics/export", { kind: "support-bundle" })) as { content: string };
		expect(exported.content).toContain("restorationTrace");
		expect(exported.content).toContain(continued.sessionId);
	});
});
