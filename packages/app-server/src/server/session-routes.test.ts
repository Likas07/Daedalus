import { afterEach, describe, expect, test } from "bun:test";
import { serializeSessionJsonl, type SessionEntry, type SessionMessageEntry } from "@daedalus-pi/coding-agent";
import type { AppServerDatabase } from "../persistence/database";
import { openAppServerDatabase } from "../persistence/database";
import { runMigrations } from "../persistence/migrations";
import { AppRouter } from "./router";
import { SessionController, type ControlledSessionRuntime, type RuntimeSessionManager } from "../runtime/session-controller";
import { SqliteSessionManager } from "../runtime/sqlite-session-manager";
import { SqliteSessionStore } from "../sessions/sqlite-session-store";

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

function appRouterWithRealController(): { appRouter: AppRouter; sessionStore: SqliteSessionStore; runtimes: PromptRecordingRuntime[] } {
	database = openAppServerDatabase(":memory:");
	runMigrations(database);
	const sessionStore = new SqliteSessionStore({ database });
	const runtimes: PromptRecordingRuntime[] = [];
	const controller = new SessionController({
		agentDir: "/agent",
		eventSink: () => {},
		makeSessionManager: async ({ cwd, sessionId, sessionPath }) =>
			SqliteSessionManager.create({ store: sessionStore, cwd, sessionId, sessionPath }).initialized(),
		nextSessionId: () => "session-controller-id",
		nextTurnId: () => "turn-1",
		runtimeFactory: async ({ cwd, sessionManager }) => {
			const runtime = new PromptRecordingRuntime(cwd, sessionManager);
			runtimes.push(runtime);
			return runtime;
		},
	});
	return { appRouter: new AppRouter({ database, publish: () => {}, controller }), sessionStore, runtimes };
}

describe("session store routes", () => {
	test("imports and exports JSONL through the router", async () => {
		const appRouter = router();
		const content = serializeSessionJsonl({
			header: { type: "session", version: 3, id: "route-session", timestamp: "2026-04-26T00:00:00.000Z", cwd: "/repo" },
			entries: [userMessage("msg-1", "hello sqlite route")],
		});

		const imported = await appRouter.handle({ kind: "request", id: "1", method: "session/import-jsonl", params: { content } });
		expect(imported).toEqual({ sessionId: "route-session" });

		const listed = await appRouter.handle({ kind: "request", id: "2", method: "session/list", params: { cwd: "/repo" } });
		expect(listed).toMatchObject({ sessions: [{ id: "route-session", messageCount: 1 }] });

		const exported = await appRouter.handle({ kind: "request", id: "3", method: "session/export-jsonl", params: { sessionId: "route-session" } });
		expect(exported).toEqual({ content, filename: "route-session.jsonl" });
	});

	test("starts a prompted session through AppRouter with an empty SQLite store", async () => {
		const { appRouter, sessionStore, runtimes } = appRouterWithRealController();

		const started = await appRouter.handle({
			kind: "request",
			id: "start",
			method: "session/start",
			params: { projectId: "/repo", prompt: "hello from gui" },
		});

		expect(started).toEqual({ sessionId: "session-controller-id" });
		expect(runtimes[0]?.sessionId).toBe("session-controller-id");
		expect(runtimes[0]?.prompts).toEqual(["hello from gui"]);
		const persisted = await sessionStore.read({ sessionId: "session-controller-id" });
		expect(persisted.header.id).toBe("session-controller-id");
		expect(persisted.entries).toHaveLength(1);
		expect(runtimes[0]?.session.sessionFile).toBe("sqlite://session-controller-id");
	});

	test("resumes an existing SQLite session through AppRouter", async () => {
		const { appRouter, sessionStore, runtimes } = appRouterWithRealController();
		await sessionStore.import({
			session: {
				header: { type: "session", version: 3, id: "existing-session", timestamp: "2026-04-26T00:00:00.000Z", cwd: "/repo" },
				entries: [userMessage("msg-1", "already here")],
			},
		});

		const resumed = await appRouter.handle({
			kind: "request",
			id: "resume",
			method: "session/resume",
			params: { sessionId: "existing-session" },
		});

		expect(resumed).toEqual({ sessionId: "existing-session", status: "active" });
		expect(runtimes[0]?.sessionId).toBe("existing-session");
		expect(runtimes[0]?.initialEntryCount).toBe(1);
		expect((await sessionStore.read({ sessionId: "existing-session" })).entries).toHaveLength(1);
	});
});
