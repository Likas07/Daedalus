import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClientRequestResultSchemas } from "@daedalus-pi/app-server-protocol";
import { type SessionEntry, type SessionMessageEntry, serializeSessionJsonl } from "@daedalus-pi/coding-agent";
import { Value } from "@sinclair/typebox/value";
import type { AppServerDatabase } from "../persistence/database";
import { openAppServerDatabase } from "../persistence/database";
import { appendEvent } from "../persistence/event-store";
import { runMigrations } from "../persistence/migrations";
import { projectRuntimeEvents } from "../persistence/projector";
import {
	type ControlledSessionRuntime,
	type RuntimeControllerMessage,
	type RuntimeSessionManager,
	SessionController,
} from "../runtime/session-controller";
import { SqliteSessionManager } from "../runtime/sqlite-session-manager";
import { SqliteSessionStore } from "../sessions/sqlite-session-store";
import { git } from "../workspaces/git";
import { AppRouter } from "./router";

let database: AppServerDatabase | undefined;

afterEach(() => {
	database?.close();
	database = undefined;
});

function router(): AppRouter {
	database = openAppServerDatabase(":memory:");
	runMigrations(database);
	return new AppRouter({
		database,
		publish: () => {},
		controller: {
			readState: () => ({ sessions: [] }),
			startSession: async () => ({}),
			startTurn: async () => ({}),
			interruptTurn: async () => {},
			disposeSession: async () => {},
		} as never,
	});
}

function userMessage(id: string, text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-04-26T00:00:01.000Z",
		message: { role: "user", content: [{ type: "text", text }], timestamp: Date.parse("2026-04-26T00:00:01.000Z") },
	};
}

interface TestSessionManager {
	getSessionId(): string;
	getSessionFile(): string | undefined;
	getEntries(): SessionEntry[];
	appendMessage(message: SessionMessageEntry["message"]): string;
}

class PromptRecordingRuntime implements ControlledSessionRuntime {
	readonly cwd: string;
	readonly session: ControlledSessionRuntime["session"];
	readonly sessionId: string;
	readonly initialEntryCount: number;
	readonly prompts: string[] = [];
	private listeners: Array<(event: unknown) => void> = [];

	constructor(cwd: string, sessionManager: RuntimeSessionManager) {
		const manager = sessionManager as TestSessionManager;
		this.cwd = cwd;
		this.sessionId = manager.getSessionId();
		this.initialEntryCount = manager.getEntries().length;
		this.session = {
			sessionFile: manager.getSessionFile(),
			subscribe: (listener) => {
				this.listeners.push(listener);
				return () => {
					this.listeners = this.listeners.filter((current) => current !== listener);
				};
			},
			prompt: async (prompt) => {
				this.prompts.push(prompt);
				manager.appendMessage({ role: "user", content: [{ type: "text", text: prompt }], timestamp: 1 });
				for (const listener of this.listeners) listener({ type: "agent_end" });
			},
			abort: async () => {},
		};
	}

	async dispose(): Promise<void> {}
}

function appRouterWithRealController(): {
	appRouter: AppRouter;
	sessionStore: SqliteSessionStore;
	runtimes: PromptRecordingRuntime[];
	events: RuntimeControllerMessage[];
} {
	database = openAppServerDatabase(":memory:");
	runMigrations(database);
	const sessionStore = new SqliteSessionStore({ database });
	const runtimes: PromptRecordingRuntime[] = [];
	const events: RuntimeControllerMessage[] = [];
	const controller = new SessionController({
		agentDir: "/agent",
		eventSink: (event) => {
			events.push(event);
			if ("type" in event && "payload" in event) {
				appendEvent(database!, {
					streamId: event.sessionId ?? event.type,
					type: event.type,
					payload: event.payload as never,
				});
				projectRuntimeEvents(database!);
			}
		},
		makeSessionManager: async ({ cwd, sessionId, sessionPath, parentSession }) =>
			SqliteSessionManager.create({ store: sessionStore, cwd, sessionId, sessionPath, parentSession }).initialized(),
		nextEventId: () => `event-${events.length + 1}`,
		nextSessionId: () => "session-controller-id",
		nextTurnId: () => "turn-1",
		runtimeFactory: async ({ cwd, sessionManager }) => {
			const runtime = new PromptRecordingRuntime(cwd, sessionManager);
			runtimes.push(runtime);
			return runtime;
		},
	});
	return { appRouter: new AppRouter({ database, publish: () => {}, controller }), sessionStore, runtimes, events };
}

async function initRepo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "daedalus-session-routes-"));
	const repo = join(root, "repo");
	await mkdir(repo);
	await git(repo, ["init"]);
	await git(repo, ["config", "user.email", "test@example.com"]);
	await git(repo, ["config", "user.name", "Test User"]);
	await writeFile(join(repo, "README.md"), "hello\n");
	await git(repo, ["add", "README.md"]);
	await git(repo, ["commit", "-m", "initial"]);
	return repo;
}

function controllerEvent(events: RuntimeControllerMessage[], type: string): RuntimeControllerMessage {
	const event = events.find((message) => "type" in message && message.type === type);
	expect(event).toBeTruthy();
	return event as RuntimeControllerMessage;
}

function expectRouteResult(method: keyof typeof ClientRequestResultSchemas, result: unknown): void {
	expect(Value.Check(ClientRequestResultSchemas[method], result)).toBe(true);
}

describe("session store routes", () => {
	test("imports and exports JSONL through the router", async () => {
		const appRouter = router();
		const content = serializeSessionJsonl({
			header: {
				type: "session",
				version: 3,
				id: "route-session",
				timestamp: "2026-04-26T00:00:00.000Z",
				cwd: "/repo",
			},
			entries: [userMessage("msg-1", "hello sqlite route")],
		});

		const imported = await appRouter.handle({
			kind: "request",
			id: "1",
			method: "session/import-jsonl",
			params: { content },
		});
		expect(imported).toEqual({ sessionId: "route-session" });
		expectRouteResult("session/import-jsonl", imported);

		const listed = await appRouter.handle({
			kind: "request",
			id: "2",
			method: "session/list",
			params: { cwd: "/repo" },
		});
		expect(listed).toMatchObject({ sessions: [{ id: "route-session", messageCount: 1 }] });
		expectRouteResult("session/list", listed);
		expect(listed).toMatchObject({
			sessions: [
				{
					id: "route-session",
					title: "hello sqlite route",
					latestMessage: "hello sqlite route",
					status: "idle",
					pendingApprovalCount: 0,
					pendingUserInput: false,
					archived: false,
				},
			],
		});

		const exported = await appRouter.handle({
			kind: "request",
			id: "3",
			method: "session/export-jsonl",
			params: { sessionId: "route-session" },
		});
		expect(exported).toEqual({ content, filename: "route-session.jsonl" });
		expectRouteResult("session/export-jsonl", exported);
	});

	test("starts a prompted session through AppRouter with an empty SQLite store", async () => {
		const { appRouter, sessionStore, runtimes, events } = appRouterWithRealController();
		const repo = await initRepo();
		const { projectId } = (await appRouter.handle({
			kind: "request",
			id: "project-open",
			method: "project/open",
			params: { path: repo },
		})) as { projectId: string };

		const started = (await appRouter.handle({
			kind: "request",
			id: "start",
			method: "session/start",
			params: {
				projectId,
				startTarget: { mode: "base-checkout", projectId, confirmation: { confirmed: true, evidence: "test" } },
				prompt: "hello from gui",
			},
		})) as { sessionId: string; runsIn: { canonicalPath: string; isolationMode: string } };

		expect(started.sessionId).toBe("session-controller-id");
		expect(started.runsIn).toMatchObject({ canonicalPath: repo, isolationMode: "base-checkout" });
		expectRouteResult("session/start", started);
		expect(runtimes[0]?.sessionId).toBe(started.sessionId);
		expect(runtimes[0]?.prompts).toEqual(["hello from gui"]);
		expect(runtimes[0]?.session.sessionFile).toBe(`sqlite://${started.sessionId}`);

		const workflow = await appRouter.handle({
			kind: "request",
			id: "workflow-read",
			method: "daedalus/workflow/read",
			params: { sessionId: started.sessionId },
		});
		expect(workflow).toMatchObject({
			sessionId: started.sessionId,
			orchestration: { sessionId: started.sessionId },
		});
		expectRouteResult("daedalus/workflow/read", workflow);

		const sessionStarted = controllerEvent(events, "session/started") as {
			sessionId: string;
			payload: { sessionId: string };
		};
		expect(sessionStarted.sessionId).toBe(started.sessionId);
		expect(sessionStarted.payload.sessionId).toBe(started.sessionId);
		const turnStarted = controllerEvent(events, "turn/started") as {
			sessionId: string;
			payload: { sessionId: string };
		};
		expect(turnStarted.sessionId).toBe(started.sessionId);
		expect(turnStarted.payload.sessionId).toBe(started.sessionId);
		const persisted = await sessionStore.read({ sessionId: started.sessionId });
		expect(persisted.header.id).toBe(started.sessionId);
		expect(persisted.header.id).toBe(sessionStarted.sessionId);
		expect(persisted.entries).toHaveLength(1);

		const selection = await appRouter.handle({
			kind: "request",
			id: "selection-get",
			method: "workspace/selection/get",
			params: { projectId },
		});
		expect(selection).toMatchObject({ degraded: false, selection: { projectId, sessionId: started.sessionId } });
		expectRouteResult("workspace/selection/get", selection);
	});

	test("replays idempotent session/start results without creating a duplicate runtime", async () => {
		const { appRouter, runtimes } = appRouterWithRealController();
		const repo = await initRepo();
		const { projectId } = (await appRouter.handle({
			kind: "request",
			id: "project-open-idempotent",
			method: "project/open",
			params: { path: repo },
		})) as { projectId: string };
		const request = {
			kind: "request" as const,
			id: "start-idempotent",
			method: "session/start" as const,
			params: {
				operationId: "op-session-start-1",
				projectId,
				startTarget: {
					mode: "base-checkout" as const,
					projectId,
					confirmation: { confirmed: true as const, evidence: "test" },
				},
			},
		};

		const first = await appRouter.handle(request);
		const second = await appRouter.handle({ ...request, id: "start-idempotent-replay" });

		expect(first).toEqual(second);
		expect(first).toMatchObject({ sessionId: "session-controller-id", operationId: "op-session-start-1" });
		expect(runtimes).toHaveLength(1);
		expectRouteResult("session/start", first);
	});

	test("starts an empty session then accepts the first turn using the returned id", async () => {
		const { appRouter, sessionStore, runtimes, events } = appRouterWithRealController();
		const repo = await initRepo();
		const { projectId } = (await appRouter.handle({
			kind: "request",
			id: "project-open",
			method: "project/open",
			params: { path: repo },
		})) as { projectId: string };

		const started = (await appRouter.handle({
			kind: "request",
			id: "start",
			method: "session/start",
			params: {
				projectId,
				startTarget: { mode: "base-checkout", projectId, confirmation: { confirmed: true, evidence: "test" } },
			},
		})) as { sessionId: string };

		expect(started.sessionId).toBe("session-controller-id");
		expectRouteResult("session/start", started);
		expect(runtimes[0]?.sessionId).toBe(started.sessionId);
		expect(runtimes[0]?.prompts).toEqual([]);
		expect((await sessionStore.read({ sessionId: started.sessionId })).header.id).toBe(started.sessionId);

		const turn = await appRouter.handle({
			kind: "request",
			id: "turn",
			method: "turn/start",
			params: { sessionId: started.sessionId, prompt: "first turn after empty start" },
		});

		expect(turn).toEqual({ turnId: "turn-1" });
		expectRouteResult("turn/start", turn);

		expect(runtimes[0]?.prompts).toEqual(["first turn after empty start"]);
		const sessionStarted = controllerEvent(events, "session/started") as {
			sessionId: string;
			payload: { sessionId: string };
		};
		const turnStarted = controllerEvent(events, "turn/started") as {
			sessionId: string;
			payload: { sessionId: string };
		};
		expect(sessionStarted.sessionId).toBe(started.sessionId);
		expect(sessionStarted.payload.sessionId).toBe(started.sessionId);
		expect(turnStarted.sessionId).toBe(started.sessionId);
		expect(turnStarted.payload.sessionId).toBe(started.sessionId);
		const persisted = await sessionStore.read({ sessionId: started.sessionId });
		expect(persisted.header.id).toBe(started.sessionId);
		expect(persisted.header.id).toBe(sessionStarted.sessionId);
		expect(persisted.entries).toHaveLength(1);
	});

	test("turn/start rejects sessions without stored runsIn before controller start", async () => {
		const appRouter = router();
		let startTurnCalls = 0;
		(
			appRouter as unknown as { options: { controller: { startTurn: () => Promise<{ turnId: string }> } } }
		).options.controller.startTurn = async () => {
			startTurnCalls++;
			return { turnId: "turn-should-not-start" };
		};
		const repo = await initRepo();
		const { projectId } = (await appRouter.handle({
			kind: "request",
			id: "project-open-legacy",
			method: "project/open",
			params: { path: repo },
		})) as { projectId: string };
		appendEvent(database!, {
			streamId: "legacy-session",
			type: "session/started",
			payload: { sessionId: "legacy-session", projectId, status: "active" },
		});
		projectRuntimeEvents(database!);

		await expect(
			appRouter.handle({
				kind: "request",
				id: "turn-legacy",
				method: "turn/start",
				params: { sessionId: "legacy-session", prompt: "nope" },
			}),
		).rejects.toThrow("has no stored workspace target");
		expect(startTurnCalls).toBe(0);
	});

	test("turn/start rejects stale isolated worktree before controller start", async () => {
		let startTurnCalls = 0;
		const appRouter = router();
		(
			appRouter as unknown as { options: { controller: { startTurn: () => Promise<{ turnId: string }> } } }
		).options.controller.startTurn = async () => {
			startTurnCalls++;
			return { turnId: "turn-should-not-start" };
		};
		const repo = await initRepo();
		const { projectId } = (await appRouter.handle({
			kind: "request",
			id: "project-open-stale",
			method: "project/open",
			params: { path: repo },
		})) as { projectId: string };
		const created = (await appRouter.handle({
			kind: "request",
			id: "create-stale",
			method: "worktree/create",
			params: { projectId, branch: "feature/stale", path: join(repo, "..", "stale-wt") },
		})) as { worktree: { id: string; path: string; branch: string } };
		await rm(created.worktree.path, { recursive: true, force: true });
		appendEvent(database!, {
			streamId: "stale-worktree-session",
			type: "session/started",
			payload: {
				sessionId: "stale-worktree-session",
				projectId,
				worktreeId: created.worktree.id,
				runsIn: {
					projectId,
					worktreeId: created.worktree.id,
					path: created.worktree.path,
					canonicalPath: created.worktree.path,
					branch: created.worktree.branch,
					isolationMode: "isolated-worktree",
					validationStatus: "valid",
				},
			},
		});
		projectRuntimeEvents(database!);

		await expect(
			appRouter.handle({
				kind: "request",
				id: "turn-stale-worktree",
				method: "turn/start",
				params: { sessionId: "stale-worktree-session", prompt: "nope" },
			}),
		).rejects.toThrow("Unsafe worktree target");
		expect(startTurnCalls).toBe(0);
	});

	test("turn/start with valid stored runsIn starts controller and persists active selection", async () => {
		const { appRouter, runtimes } = appRouterWithRealController();
		const repo = await initRepo();
		const { projectId } = (await appRouter.handle({
			kind: "request",
			id: "project-open-valid-turn",
			method: "project/open",
			params: { path: repo },
		})) as { projectId: string };
		const started = (await appRouter.handle({
			kind: "request",
			id: "start-valid-turn",
			method: "session/start",
			params: {
				projectId,
				startTarget: { mode: "base-checkout", projectId, confirmation: { confirmed: true, evidence: "test" } },
			},
		})) as { sessionId: string };

		const turn = await appRouter.handle({
			kind: "request",
			id: "turn-valid",
			method: "turn/start",
			params: { sessionId: started.sessionId, prompt: "validated turn" },
		});

		expect(turn).toEqual({ turnId: "turn-1" });
		expect(runtimes[0]?.prompts).toEqual(["validated turn"]);
		const selection = await appRouter.handle({
			kind: "request",
			id: "selection-get-valid-turn",
			method: "workspace/selection/get",
			params: { projectId },
		});
		expect(selection).toMatchObject({ degraded: false, selection: { projectId, sessionId: started.sessionId } });
	});

	test("resumes an existing SQLite session then accepts a turn using the resumed id", async () => {
		const { appRouter, sessionStore, runtimes, events } = appRouterWithRealController();
		await sessionStore.import({
			session: {
				header: {
					type: "session",
					version: 3,
					id: "existing-session",
					timestamp: "2026-04-26T00:00:00.000Z",
					cwd: "/repo",
				},
				entries: [userMessage("msg-1", "already here")],
			},
		});

		const resumed = (await appRouter.handle({
			kind: "request",
			id: "resume",
			method: "session/resume",
			params: { sessionId: "existing-session" },
		})) as { sessionId: string; status: string };

		expect(resumed).toMatchObject({
			sessionId: "existing-session",
			status: "needs-attention",
			identity: { status: "missing" },
		});
		expectRouteResult("session/resume", resumed);
		expect(runtimes).toHaveLength(0);
		expect((await sessionStore.read({ sessionId: resumed.sessionId })).entries).toHaveLength(1);

		await expect(
			appRouter.handle({
				kind: "request",
				id: "turn",
				method: "turn/start",
				params: { sessionId: resumed.sessionId, prompt: "turn after resume" },
			}),
		).rejects.toThrow("Unknown session: existing-session");

		const needsAttention = controllerEvent(events, "session/resume-identity-mismatched") as {
			sessionId: string;
			payload: { sessionId: string; identity: { status: string } };
		};
		expect(needsAttention.sessionId).toBe(resumed.sessionId);
		expect(needsAttention.payload.sessionId).toBe(resumed.sessionId);
		expect(needsAttention.payload.identity.status).toBe("missing");
		const persisted = await sessionStore.read({ sessionId: resumed.sessionId });
		expect(persisted.header.id).toBe(resumed.sessionId);
		expect(persisted.entries).toHaveLength(1);
	});

	test("continues a base session in an idempotent linked worktree without mutating the source", async () => {
		const { appRouter, sessionStore, runtimes, events } = appRouterWithRealController();
		const repo = await initRepo();
		const opened = (await appRouter.handle({
			kind: "request",
			id: "open",
			method: "project/open",
			params: { path: repo },
		})) as { projectId: string };
		const runsIn = {
			projectId: opened.projectId,
			path: repo,
			canonicalPath: repo,
			branch: "master",
			isolationMode: "base-checkout" as const,
			validationStatus: "valid" as const,
		};
		appendEvent(database!, {
			streamId: "source-session",
			type: "session/started",
			payload: { sessionId: "source-session", projectId: opened.projectId, runsIn },
		});
		projectRuntimeEvents(database!);

		const first = (await appRouter.handle({
			kind: "request",
			id: "continue-1",
			method: "session/continue-in-worktree",
			params: {
				sourceSessionId: "source-session",
				projectId: opened.projectId,
				branch: "continue-source-session",
				prompt: "continue here",
				operationId: "continue-op-1",
			},
		})) as { sessionId: string; parentSessionId: string; worktree: { id: string }; runsIn: { worktreeId?: string } };
		expectRouteResult("session/continue-in-worktree", first);
		expect(first.parentSessionId).toBe("source-session");
		expect(first.runsIn.worktreeId).toBe(first.worktree.id);
		expect(runtimes).toHaveLength(1);
		expect(runtimes[0]?.prompts).toEqual(["continue here"]);

		const replay = await appRouter.handle({
			kind: "request",
			id: "continue-2",
			method: "session/continue-in-worktree",
			params: {
				sourceSessionId: "source-session",
				projectId: opened.projectId,
				branch: "continue-source-session",
				prompt: "continue here",
				operationId: "continue-op-1",
			},
		});
		expect(replay).toEqual(first);
		expect(runtimes).toHaveLength(1);

		const child = await sessionStore.read({ sessionId: first.sessionId });
		expect(child.header.parentSession).toBe("source-session");
		const started = controllerEvent(events, "session/started") as { payload: { parentSessionId?: string } };
		expect(started.payload.parentSessionId).toBe("source-session");
		const source = database!
			.query<{ worktree_id: string | null; runs_in_json: string | null }, [string]>(
				"SELECT worktree_id, runs_in_json FROM sessions WHERE id = ?",
			)
			.get("source-session");
		expect(source?.worktree_id).toBeNull();
		expect(JSON.parse(source?.runs_in_json ?? "{}")).toMatchObject({ isolationMode: "base-checkout" });
		expect(await appRouter.handle({
			kind: "request",
			id: "selection",
			method: "workspace/selection/get",
			params: { projectId: opened.projectId },
		})).toMatchObject({ selection: { sessionId: first.sessionId } });
	});

	test("continue-in-worktree rejects missing, legacy, and cross-project sources", async () => {
		const { appRouter } = appRouterWithRealController();
		const repo = await initRepo();
		const opened = (await appRouter.handle({
			kind: "request",
			id: "open",
			method: "project/open",
			params: { path: repo },
		})) as { projectId: string };
		appendEvent(database!, {
			streamId: "legacy-session",
			type: "session/started",
			payload: { sessionId: "legacy-session", projectId: opened.projectId },
		});
		appendEvent(database!, {
			streamId: "cross-session",
			type: "session/started",
			payload: {
				sessionId: "cross-session",
				projectId: opened.projectId,
				runsIn: {
					projectId: opened.projectId,
					path: repo,
					canonicalPath: repo,
					branch: "master",
					isolationMode: "base-checkout",
					validationStatus: "valid",
				},
			},
		});
		projectRuntimeEvents(database!);

		const params = { projectId: opened.projectId, branch: "continue-invalid", operationId: "invalid-op" };
		await expect(
			appRouter.handle({
				kind: "request",
				id: "missing",
				method: "session/continue-in-worktree",
				params: { ...params, sourceSessionId: "missing-session" },
			}),
		).rejects.toThrow("Unknown source session");
		await expect(
			appRouter.handle({
				kind: "request",
				id: "legacy",
				method: "session/continue-in-worktree",
				params: { ...params, operationId: "invalid-op-2", sourceSessionId: "legacy-session" },
			}),
		).rejects.toThrow("no stored workspace target");
		await expect(
			appRouter.handle({
				kind: "request",
				id: "cross",
				method: "session/continue-in-worktree",
				params: { ...params, operationId: "invalid-op-3", sourceSessionId: "cross-session", projectId: "other-project" },
			}),
		).rejects.toThrow("belongs to project");
	});
});
