import { describe, expect, test } from "bun:test";
import { AppServerClient, type AppServerTransport } from "@daedalus-pi/app-server-client";
import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import { buildWsUrl, createGuiRuntime, getThreadFirstRouteFlag, getViteBootstrapEnv } from "./runtime";
import { statusTone } from "./view-model";

class MockTransport implements AppServerTransport {
	private listener: ((message: unknown) => void) | undefined;
	readonly sent: unknown[] = [];
	readonly lifecycle = new Map<string, Set<(event?: unknown) => void>>();
	readonly responseOverride?: (method: string | undefined, params?: unknown) => unknown | undefined;
	constructor(replayEvents: AppEvent[] = [], responseOverride?: (method: string | undefined, params?: unknown) => unknown | undefined) {
		this.replayEvents = replayEvents;
		this.responseOverride = responseOverride;
	}

	readonly replayEvents: AppEvent[];

	send(message: unknown): void {
		this.sent.push(message);
		if (!message || typeof message !== "object") return;
		const request = message as { kind?: string; id?: string; method?: string; params?: unknown };
		if (request.kind !== "request" || !request.id) return;
		this.listener?.({
			kind: "response",
			id: request.id,
			ok: true,
			result:
				request.method === "event/replay"
					? { events: this.replayEvents }
					: (this.responseOverride?.(request.method, request.params) ?? responseFor(request.method, request.params)),
		});
	}

	onMessage(listener: (message: unknown) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	close(): void {}

	addEventListener(type: string, listener: (event?: unknown) => void): void {
		const listeners = this.lifecycle.get(type) ?? new Set();
		listeners.add(listener);
		this.lifecycle.set(type, listeners);
	}

	emitLifecycle(type: string, event?: unknown): void {
		for (const listener of this.lifecycle.get(type) ?? []) listener(event);
	}

	emit(message: unknown): void {
		this.listener?.(message);
	}
}

function terminalSnapshot(
	terminalId: string,
	overrides: { history?: string; cols?: number; rows?: number } = {},
): unknown {
	const cols = overrides.cols ?? 80;
	const rows = overrides.rows ?? 24;
	return {
		terminalId,
		cwd: "/repo",
		shell: "/bin/sh",
		dimensions: { cols, rows },
		status: "running",
		history: overrides.history ?? "",
		cursor: { nextSeq: 1, replayCursor: 0 },
		attached: true,
		createdAt: "now",
		updatedAt: "now",
		elapsedMs: 0,
	};
}

function responseFor(method: string | undefined, params?: unknown): unknown {
	switch (method) {
		case "initialize":
			return { protocolVersion: "test" };
		case "project/list":
			return { projects: [{ id: "project-1", path: "/repo", name: "repo" }] };
		case "project/open":
			return { projectId: "project-1", path: "/repo", name: "repo" };
		case "session/list":
			return {
				sessions: [
					{
						sessionId: "session-1",
						title: "Existing",
						status: "running",
						runsIn: {
							mode: "isolated-worktree",
							projectId: "project-1",
							worktreeId: "wt-1",
							branch: "task/hello",
							path: "/repo-wt",
							isolationMode: "isolated-worktree",
							validationStatus: "valid",
						},
					},
				],
			};
		case "workspace/selection/get":
			return { degraded: false, selection: { projectId: "project-1", sessionId: "session-1", updatedAt: "now" } };
		case "workspace/selection/set": {
			const selection = params as { projectId?: string; sessionId?: string };
			return {
				degraded: false,
				selection: selection.sessionId
					? { projectId: selection.projectId ?? "project-1", sessionId: selection.sessionId, updatedAt: "now" }
					: undefined,
			};
		}
		case "terminal/list":
			return { terminals: [terminalSnapshot("term-1", { history: "hello" })] };
		case "model/list":
			return {
				models: [{ id: "model-a", label: "Model A", provider: "test", available: true }],
				selectedModel: "model-a",
			};
		case "auth/status":
			return { providers: [{ provider: "test", authenticated: true, status: "ready" }] };
		case "config/get":
			return { config: { "composer.effort": "high" } };
		case "access/get":
			return {
				policy: { mode: "auto-accept", autoApproveSoftPrompts: true, bypassHardBlocks: false, auditRequired: true },
			};
		case "access/set":
			return {
				policy: {
					mode: "unrestricted",
					autoApproveSoftPrompts: true,
					bypassHardBlocks: false,
					auditRequired: true,
				},
			};
		case "event/replay":
			return { events: [] };
		case "diff/get":
			return { diff: { id: ((params as { diffId?: string })?.diffId ?? "target-diff") as string, files: [] } };
		case "composer/file-search":
			return { files: [{ path: "src/index.ts", label: "src/index.ts", kind: "file", extension: ".ts" }] };
		case "composer/command-list":
			return { commands: [{ name: "plan", label: "Plan", source: "built-in" }] };
		case "composer/attachment/save":
			return { attachment: { id: "att-1", kind: "text", filename: "note.txt", size: 4 } };
		case "worktree/create":
			return {
				worktree: {
					id: "wt-1",
					projectId: "project-1",
					branch: "task/hello",
					path: "/repo-wt",
					status: "ready",
					dirty: false,
					dirtyCount: 0,
					activeSessionCount: 0,
					cleanupRequiresConfirmation: false,
					createdAt: "now",
					updatedAt: "now",
				},
			};
		case "worktree/list":
			return {
				worktrees: [
					{
						id: "wt-1",
						projectId: "project-1",
						branch: "task/hello",
						path: "/repo-wt",
						status: "ready",
						dirty: false,
						dirtyCount: 0,
						activeSessionCount: 0,
						cleanupRequiresConfirmation: false,
						createdAt: "now",
						updatedAt: "now",
					},
				],
			};
		case "session/start":
			return {
				sessionId: "session-new",
				runsIn: {
					mode: "isolated-worktree",
					projectId: "project-1",
					worktreeId: "wt-1",
					branch: "task/hello",
					path: "/repo-wt",
					isolationMode: "isolated-worktree",
					validationStatus: "valid",
				},
			};
		case "session/continue-in-worktree":
			return {
				sessionId: "session-child",
				parentSessionId: "session-1",
				worktree: {
					id: "wt-child",
					projectId: "project-1",
					branch: "continue/session-1",
					path: "/repo-child",
					status: "ready",
					dirty: false,
					dirtyCount: 0,
					activeSessionCount: 1,
					cleanupRequiresConfirmation: false,
					createdAt: "now",
					updatedAt: "now",
				},
				runsIn: {
					mode: "isolated-worktree",
					projectId: "project-1",
					worktreeId: "wt-child",
					branch: "continue/session-1",
					path: "/repo-child",
					isolationMode: "isolated-worktree",
					validationStatus: "valid",
				},
				operationId: (params as { operationId?: string } | undefined)?.operationId,
			};
		case "terminal/create":
		case "terminal/resize":
		case "terminal/kill":
			return { terminal: terminalSnapshot("term-2", { cols: 100, rows: 30 }) };
		case "terminal/replay":
			return { chunks: [{ seq: 1, data: "out" }], nextSeq: 2, status: "running", replayCursor: 1 };
		default:
			return {};
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

	test("reads thread-first route feature flag", () => {
		expect(getThreadFirstRouteFlag({})).toBe(false);
		expect(getThreadFirstRouteFlag({ VITE_DAEDALUS_THREAD_FIRST_ROUTE: "true" })).toBe(true);
		expect(getThreadFirstRouteFlag({ VITE_DAEDALUS_THREAD_FIRST_ROUTE: "1" })).toBe(true);
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
		expect(runtime.state.sessions[0]).toMatchObject({ id: "session-1", title: "Implement GUI", status: "running" });
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
		expect(transport.sent).toContainEqual(
			expect.objectContaining({
				kind: "request",
				method: "approval/respond",
				params: expect.objectContaining({ approvalId: "approval-1", decision: "denied" }),
			}),
		);
	});

	test("selects and clears the selected session", async () => {
		const runtime = await createGuiRuntime({
			bootstrap: { wsEndpoint: "ws://127.0.0.1:43117/ws" },
			transport: new MockTransport(),
		});

		await runtime.selectSession("session-1");
		expect(runtime.state.selectedSessionId).toBe("session-1");

		await runtime.selectSession();
		expect(runtime.state.selectedSessionId).toBeUndefined();
	});

	test("hydrates and persists selection only behind the thread-first route flag", async () => {
		const transport = new MockTransport();
		const runtime = await createGuiRuntime({
			client: new AppServerClient({ transport }),
			bootstrap: { projectRoot: "/repo" },
			threadFirstRoute: true,
		});
		await runtime.initialize();

		expect(runtime.state.selectedSessionId).toBe("session-1");
		await runtime.selectSession(undefined);

		expect(runtime.state.selectedSessionId).toBeUndefined();
		expect(transport.sent).toContainEqual(
			expect.objectContaining({ method: "workspace/selection/get", params: { projectId: "project-1" } }),
		);
		expect(transport.sent).toContainEqual(
			expect.objectContaining({
				method: "workspace/selection/set",
				params: { projectId: "project-1", sessionId: undefined },
			}),
		);
	});

	test("clears degraded workspace selection instead of falling back to the first thread", async () => {
		const transport = new MockTransport([], (method) =>
			method === "workspace/selection/get"
				? {
						degraded: true,
						reason: "Selected session is stale: missing-session",
						restorationTrace: {
							projectId: "project-1",
							status: "missing",
							resolvedSession: "missing-session",
							checkedAt: "now",
						},
					}
				: undefined,
		);
		const runtime = await createGuiRuntime({
			client: new AppServerClient({ transport }),
			bootstrap: { projectRoot: "/repo" },
			threadFirstRoute: true,
		});

		await runtime.initialize();

		expect(runtime.state.sessions[0]?.id).toBe("session-1");
		expect(runtime.state.selectedSessionId).toBeUndefined();
		expect(runtime.state.diagnostics.join("\n")).toContain("workspace selection degraded");
		expect(runtime.state.diagnostics.join("\n")).toContain("workspace restoration trace");
	});

	test("selects a newly started session from the first prompt", async () => {
		const transport = new MockTransport();
		const runtime = await createGuiRuntime({ client: new AppServerClient({ transport }) });
		await runtime.initialize();

		await runtime.startSessionFromPrompt({ path: "/repo", prompt: "hello" });

		expect(runtime.state.sessions.find((session) => session.id === "session-new")).toMatchObject({
			id: "session-new",
			title: "hello",
			status: "active",
			projectId: "project-1",
			worktreeId: "wt-1",
		});
		expect(runtime.state.selectedSessionId).toBe("session-new");
		expect(runtime.state.newBuild).toMatchObject({ kind: "running", sessionId: "session-new" });
		expect(transport.sent).toContainEqual(
			expect.objectContaining({
				method: "worktree/create",
				params: expect.objectContaining({ operationId: expect.stringMatching(/^new-build-/) }),
			}),
		);
		expect(transport.sent).toContainEqual(
			expect.objectContaining({
				method: "session/start",
				params: expect.objectContaining({ operationId: expect.stringMatching(/^new-build-/) }),
			}),
		);
	});

	test("continues the selected source session in a returned worktree thread", async () => {
		const transport = new MockTransport();
		const runtime = await createGuiRuntime({ client: new AppServerClient({ transport }), threadFirstRoute: true });
		await runtime.initialize();
		const sourceBefore = { ...runtime.state.sessions.find((session) => session.id === "session-1") };

		const result = await runtime.continueInWorktree({ sourceSessionId: "session-1", projectId: "project-1" });

		expect(result.sessionId).toBe("session-child");
		expect(runtime.state.sessions.find((session) => session.id === "session-1")).toMatchObject(sourceBefore);
		expect(runtime.state.worktrees.find((worktree) => worktree.id === "wt-child")).toMatchObject({ path: "/repo-child" });
		expect(runtime.state.sessions.find((session) => session.id === "session-child")).toMatchObject({
			id: "session-child",
			parentSessionId: "session-1",
			sourceSessionId: "session-1",
			projectId: "project-1",
			worktreeId: "wt-child",
		});
		expect(runtime.state.selectedSessionId).toBe("session-child");
		expect(transport.sent).toContainEqual(
			expect.objectContaining({
				method: "session/continue-in-worktree",
				params: expect.objectContaining({
					sourceSessionId: "session-1",
					projectId: "project-1",
					operationId: expect.stringMatching(/^continue-worktree-/),
				}),
			}),
		);
		expect(transport.sent).toContainEqual(
			expect.objectContaining({
				method: "workspace/selection/set",
				params: { projectId: "project-1", sessionId: "session-child" },
			}),
		);
	});

	test("maps statuses to renderer tones", () => {
		expect(statusTone("running")).toBe("info");
		expect(statusTone("waiting_for_approval")).toBe("warning");
		expect(statusTone("failed")).toBe("danger");
		expect(statusTone("done")).toBe("success");
		expect(statusTone(undefined)).toBe("muted");
	});
});

describe("GUI runtime expanded APIs", () => {
	test("hydrates renderer state and wires composer terminal access actions", async () => {
		const transport = new MockTransport();
		const runtime = await createGuiRuntime({ client: new AppServerClient({ transport }) });
		await runtime.initialize();

		expect(runtime.state.projects[0]?.path).toBe("/repo");
		expect(runtime.state.sessions[0]?.id).toBe("session-1");
		expect(runtime.state.terminals[0]?.history).toBe("hello");
		expect(runtime.state.selectedModel).toBe("model-a");
		expect(runtime.state.effort).toBe("high");
		expect(runtime.state.accessMode).toBe("auto-accept");

		await runtime.startTurn({
			sessionId: "session-1",
			prompt: "go",
			attachmentIds: ["att-1"],
			filePaths: ["src/index.ts"],
		});
		expect(transport.sent).toContainEqual(
			expect.objectContaining({
				method: "turn/start",
				params: expect.objectContaining({
					model: "model-a",
					effort: "high",
					accessMode: "auto-accept",
					attachmentIds: ["att-1"],
					filePaths: ["src/index.ts"],
				}),
			}),
		);

		expect(await runtime.searchComposerFiles({ projectId: "project-1", query: "index" })).toEqual([
			{ path: "src/index.ts", label: "src/index.ts", kind: "file", extension: ".ts" },
		]);
		expect(await runtime.listComposerCommands("session-1")).toEqual([
			{ name: "plan", label: "Plan", source: "built-in" },
		]);
		expect(await runtime.saveComposerAttachment({ filename: "note.txt", dataBase64: "dGVzdA==" })).toEqual({
			id: "att-1",
			kind: "text",
			filename: "note.txt",
			size: 4,
		});

		await runtime.setAccessMode("unrestricted");
		expect(runtime.state.accessMode).toBe("unrestricted");
		await runtime.createTerminal({ cwd: "/repo", cols: 100, rows: 30 });
		transport.emit({
			kind: "notification",
			method: "terminal/event",
			params: { terminalId: "term-2", event: { data: "chunk" } },
		});
		expect(runtime.state.terminals.find((terminal) => terminal.terminalId === "term-2")?.history).toContain("chunk");
	});

	test("backfills hydrated session target fields from runsIn", async () => {
		const transport = new MockTransport();
		const runtime = await createGuiRuntime({ client: new AppServerClient({ transport }) });
		await runtime.initialize();
		expect(runtime.state.sessions.find((session) => session.id === "session-1")).toMatchObject({
			projectId: "project-1",
			worktreeId: "wt-1",
		});
	});

	test("uses an explicit diffId instead of the selected session target", async () => {
		const transport = new MockTransport();
		const runtime = await createGuiRuntime({ client: new AppServerClient({ transport }) });
		await runtime.initialize();
		await runtime.selectSession("session-1");
		await runtime.refreshDiff("explicit-diff");
		expect(transport.sent).toContainEqual(
			expect.objectContaining({ method: "diff/get", params: { diffId: "explicit-diff" } }),
		);
	});

	test("defaults diff, git, and terminals to the selected valid thread target", async () => {
		const transport = new MockTransport();
		const runtime = await createGuiRuntime({ client: new AppServerClient({ transport }) });
		await runtime.initialize();
		await runtime.selectSession("session-1");
		await runtime.refreshDiff();
		await runtime.stageFiles?.(["src/index.ts"]);
		await runtime.createTerminal({
			cwd: "/repo-wt",
			projectId: "project-1",
			worktreeId: "wt-1",
			sessionId: "session-1",
			requireRootBoundary: true,
			guardTarget: {
				projectId: "project-1",
				rootPath: "/repo-wt",
				canonicalRootPath: "/repo-wt",
				targetPath: "/repo-wt",
				canonicalTargetPath: "/repo-wt",
			},
		});
		expect(transport.sent).toContainEqual(
			expect.objectContaining({ method: "diff/get", params: { target: { kind: "worktree", projectId: "project-1", worktreeId: "wt-1" } } }),
		);
		expect(transport.sent).toContainEqual(expect.objectContaining({ method: "git/stage", params: { diffId: "wt-1", paths: ["src/index.ts"] } }));
		expect(transport.sent).toContainEqual(
			expect.objectContaining({
				method: "terminal/create",
				params: expect.objectContaining({ projectId: "project-1", worktreeId: "wt-1", sessionId: "session-1", requireRootBoundary: true }),
			}),
		);
	});
});

describe("GUI runtime reconnect", () => {
	test("marks disconnected on transport close and replays missed events on reconnect", async () => {
		const first = new MockTransport();
		const replayed: AppEvent = {
			id: "event-2",
			type: "session/changed",
			ts: "now",
			sessionId: "session-2",
			payload: { title: "Replayed", status: "running" },
		};
		const second = new MockTransport([replayed]);
		const runtime = await createGuiRuntime({
			transport: first,
			createTransport: () => second,
			reconnect: { baseDelayMs: 1, maxDelayMs: 1 },
		});
		await runtime.initialize();
		first.emit({
			kind: "notification",
			method: "event/appended",
			params: {
				event: {
					id: "event-1",
					type: "session/changed",
					ts: "now",
					sessionId: "session-1",
					payload: { title: "Live", status: "running" },
				},
			},
		});

		first.emitLifecycle("close");
		expect(runtime.state.connectionStatus).toBe("disconnected");
		expect(runtime.state.connected).toBe(false);

		await runtime.reconnect();
		expect(runtime.state.connectionStatus).toBe("connected");
		expect(runtime.state.lastEventCursor).toBe("event-2");
		expect(runtime.state.sessions.some((session) => session.id === "session-2")).toBe(true);
		expect(second.sent).toContainEqual(
			expect.objectContaining({ method: "event/replay", params: { cursor: { after: "event-1" } } }),
		);
	});

	test("suppresses duplicate replayed events", async () => {
		const event: AppEvent = {
			id: "event-1",
			type: "session/changed",
			ts: "now",
			sessionId: "session-1",
			payload: { title: "Once", status: "running" },
		};
		const transport = new MockTransport([event]);
		const runtime = await createGuiRuntime({
			transport,
			createTransport: () => transport,
			reconnect: { baseDelayMs: 1, maxDelayMs: 1 },
		});
		await runtime.initialize();
		transport.emit({ kind: "notification", method: "event/appended", params: { event } });
		transport.emitLifecycle("error", new Error("socket lost"));
		await runtime.reconnect();
		expect(runtime.state.events.filter((item) => item.id === "event-1")).toHaveLength(1);
	});

	test("records failed reconnect diagnostics", async () => {
		const first = new MockTransport();
		const runtime = await createGuiRuntime({
			transport: first,
			createTransport: () => {
				throw new Error("dial failed");
			},
			reconnect: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
		});
		await runtime.initialize();
		first.emitLifecycle("close");
		await runtime.reconnect();
		expect(runtime.state.connectionStatus).toBe("failed");
		expect(runtime.exportDiagnostics()).toContain("dial failed");
	});
});
