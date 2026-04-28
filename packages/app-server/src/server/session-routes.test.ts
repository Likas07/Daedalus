import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClientRequestResultSchemas } from "@daedalus-pi/app-server-protocol";
import { type SessionEntry, type SessionMessageEntry, serializeSessionJsonl } from "@daedalus-pi/coding-agent";
import { Value } from "@sinclair/typebox/value";
import type { AppServerDatabase } from "../persistence/database";
import { openAppServerDatabase } from "../persistence/database";
import { runMigrations } from "../persistence/migrations";
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
		},
		makeSessionManager: async ({ cwd, sessionId, sessionPath }) =>
			SqliteSessionManager.create({ store: sessionStore, cwd, sessionId, sessionPath }).initialized(),
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

		expect(resumed).toEqual({ sessionId: "existing-session", status: "active" });
		expectRouteResult("session/resume", resumed);
		expect(runtimes[0]?.sessionId).toBe(resumed.sessionId);
		expect(runtimes[0]?.initialEntryCount).toBe(1);
		expect((await sessionStore.read({ sessionId: resumed.sessionId })).entries).toHaveLength(1);

		const turn = await appRouter.handle({
			kind: "request",
			id: "turn",
			method: "turn/start",
			params: { sessionId: resumed.sessionId, prompt: "turn after resume" },
		});

		expect(turn).toEqual({ turnId: "turn-1" });
		expect(runtimes[0]?.prompts).toEqual(["turn after resume"]);
		const sessionResumed = controllerEvent(events, "session/resumed") as {
			sessionId: string;
			payload: { sessionId: string };
		};
		const turnStarted = controllerEvent(events, "turn/started") as {
			sessionId: string;
			payload: { sessionId: string };
		};
		expect(sessionResumed.sessionId).toBe(resumed.sessionId);
		expect(sessionResumed.payload.sessionId).toBe(resumed.sessionId);
		expect(turnStarted.sessionId).toBe(resumed.sessionId);
		expect(turnStarted.payload.sessionId).toBe(resumed.sessionId);
		const persisted = await sessionStore.read({ sessionId: resumed.sessionId });
		expect(persisted.header.id).toBe(resumed.sessionId);
		expect(persisted.header.id).toBe(sessionResumed.sessionId);
		expect(persisted.entries).toHaveLength(2);
	});
});
