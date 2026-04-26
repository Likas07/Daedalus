import { afterEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appServerProtocolVersion, ClientRequestResultSchemas } from "@daedalus-pi/app-server-protocol";
import { Value } from "@sinclair/typebox/value";
import {
	AppRouter,
	type AppServerInstance,
	openAppServerDatabase,
	readEvents,
	runMigrations,
	startAppServer,
} from "..";

const servers: AppServerInstance[] = [];
afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.stop()));
});

test("app server accepts websocket protocol requests and persists events", async () => {
	const dir = mkdtempSync(join(tmpdir(), "daedalus-app-server-"));
	const db = join(dir, "app.sqlite");
	const server = await startAppServer({
		databasePath: db,
		token: "test-token",
		runtimeFactory: async (input) => ({
			cwd: input.cwd,
			session: {
				sessionFile: input.sessionId ? `sqlite://${input.sessionId}` : undefined,
				subscribe: () => () => {},
				prompt: async () => {},
				abort: async () => {},
			},
			dispose: async () => {},
		}),
	});
	servers.push(server);

	const messages: unknown[] = [];
	const ws = new WebSocket(`${server.wsUrl}?token=test-token`);
	ws.addEventListener("message", (event) => messages.push(JSON.parse(String(event.data))));
	await new Promise<void>((resolve, reject) => {
		ws.addEventListener("open", () => resolve(), { once: true });
		ws.addEventListener("error", () => reject(new Error("websocket error")), { once: true });
	});

	ws.send(
		JSON.stringify({
			kind: "request",
			id: "1",
			method: "initialize",
			params: { protocolVersion: appServerProtocolVersion, client: { name: "test" } },
		}),
	);
	const initialized = await waitFor(() => messages.find((message) => isResponse(message, "1")));
	expectRouteResult("initialize", initialized);

	ws.send(JSON.stringify({ kind: "request", id: "2", method: "project/open", params: { path: dir } }));
	const open = (await waitFor(() => messages.find((message) => isResponse(message, "2")))) as {
		result: { projectId: string };
	};
	expectRouteResult("project/open", open);

	ws.send(
		JSON.stringify({
			kind: "request",
			id: "3",
			method: "session/start",
			params: { projectId: open.result.projectId, prompt: "hello" },
		}),
	);
	const started = await waitFor(() => messages.find((message) => isResponse(message, "3")));
	expectRouteResult("session/start", started);
	await waitFor(() => readEvents(openAppServerDatabase(db)).some((event) => event.type === "session/started"));

	const database = openAppServerDatabase(db);
	const events = readEvents(database);
	database.close();
	expect(events.map((event) => event.type)).toContain("project/registered");
	expect(events.map((event) => event.type)).toContain("session/started");
	expect(events.map((event) => event.type)).toContain("turn/started");
	ws.close();
});

test("app router returns canonical required read-model route shapes", async () => {
	const dir = mkdtempSync(join(tmpdir(), "daedalus-app-router-shapes-"));
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	try {
		const router = new AppRouter({
			database,
			publish: () => {},
			controller: {
				readState: () => ({ sessions: [] }),
				startSession: async () => ({ sessionId: "session-1" }),
				startTurn: async () => ({ turnId: "turn-1" }),
				interruptTurn: async () => {},
				disposeSession: async () => {},
			} as never,
		});
		const project = await router.handle({
			kind: "request",
			id: "project-open",
			method: "project/open",
			params: { path: dir },
		});
		expectResultShape("project/open", project);
		expectResultShape(
			"project/list",
			await router.handle({ kind: "request", id: "project-list", method: "project/list", params: {} }),
		);
		expectResultShape(
			"auth/status",
			await router.handle({ kind: "request", id: "auth", method: "auth/status", params: {} }),
		);
		expectResultShape(
			"model/list",
			await router.handle({ kind: "request", id: "models", method: "model/list", params: {} }),
		);
		expectResultShape(
			"settings/read",
			await router.handle({ kind: "request", id: "settings", method: "settings/read", params: {} }),
		);
		expectResultShape(
			"access/get",
			await router.handle({ kind: "request", id: "access", method: "access/get", params: {} }),
		);
		expectResultShape(
			"checkpoint/list",
			await router.handle({
				kind: "request",
				id: "checkpoints",
				method: "checkpoint/list",
				params: { sessionId: "session-1" },
			}),
		);
		expectResultShape(
			"orchestration/read",
			await router.handle({ kind: "request", id: "orchestration", method: "orchestration/read", params: {} }),
		);
		expectResultShape(
			"automation/read",
			await router.handle({ kind: "request", id: "automation", method: "automation/read", params: {} }),
		);
		expectResultShape(
			"event/replay",
			await router.handle({
				kind: "request",
				id: "events",
				method: "event/replay",
				params: { types: ["session/started"] },
			}),
		);
	} finally {
		database.close();
	}
});

test("app server routes PTY terminal create, input, resize, replay, and kill", async () => {
	const dir = mkdtempSync(join(tmpdir(), "daedalus-app-server-terminal-"));
	const db = join(dir, "app.sqlite");
	let onData: (data: string) => void = () => {};
	let onExit: (event: { exitCode: number | null; signal: string | null }) => void = () => {};
	const writes: string[] = [];
	const resizes: Array<[number, number]> = [];
	const server = await startAppServer({
		databasePath: db,
		token: "test-token",
		terminalPty: {
			spawn: () => ({
				pid: 99,
				write: (data) => writes.push(data),
				resize: (cols, rows) => resizes.push([cols, rows]),
				kill: () => onExit({ exitCode: null, signal: "SIGTERM" }),
				onData: (listener) => {
					onData = listener;
					return () => {};
				},
				onExit: (listener) => {
					onExit = listener;
					return () => {};
				},
			}),
		},
	});
	servers.push(server);
	const messages: unknown[] = [];
	const ws = new WebSocket(`${server.wsUrl}?token=test-token`);
	ws.addEventListener("message", (event) => messages.push(JSON.parse(String(event.data))));
	await new Promise<void>((resolve, reject) => {
		ws.addEventListener("open", () => resolve(), { once: true });
		ws.addEventListener("error", () => reject(new Error("websocket error")), { once: true });
	});
	const request = (id: string, method: string, params: unknown) =>
		ws.send(JSON.stringify({ kind: "request", id, method, params }));
	request("1", "terminal/create", { cwd: dir, cols: 80, rows: 24 });
	const created = (await waitFor(() => messages.find((message) => isResponse(message, "1")))) as {
		result: { terminal: { terminalId: string } };
	};
	expectRouteResult("terminal/create", created);
	const terminalId = created.result.terminal.terminalId;
	expect(created.result.terminal).not.toHaveProperty("id");
	onData("hello\n");
	request("2", "terminal/input", { terminalId, data: "pwd\n" });
	const input = await waitFor(() => messages.find((message) => isResponse(message, "2")));
	expectRouteResult("terminal/input", input);
	request("3", "terminal/resize", { terminalId, cols: 100, rows: 40 });
	const resized = await waitFor(() => messages.find((message) => isResponse(message, "3")));
	expectRouteResult("terminal/resize", resized);
	request("4", "terminal/replay", { terminalId, afterSeq: 0 });
	const replay = (await waitFor(() => messages.find((message) => isResponse(message, "4")))) as {
		result: { chunks: Array<{ data: string }> };
	};
	expectRouteResult("terminal/replay", replay);
	request("5", "terminal/kill", { terminalId });
	const killed = (await waitFor(() => messages.find((message) => isResponse(message, "5")))) as {
		result: { terminal: { status: string } };
	};
	expectRouteResult("terminal/kill", killed);
	expect(writes).toEqual(["pwd\n"]);
	expect(resizes).toEqual([[100, 40]]);
	expect(replay.result.chunks.map((chunk) => chunk.data)).toEqual(["hello\n"]);
	expect(killed.result.terminal.status).toBe("killed");
	expect(messages).toContainEqual({
		kind: "notification",
		method: "terminal/output",
		params: { terminalId, seq: 1, data: "hello\n" },
	});
	ws.close();
});

function isResponse(
	message: unknown,
	id: string,
): message is { kind: "response"; id: string; ok: boolean; result: unknown } {
	return (
		typeof message === "object" &&
		message !== null &&
		(message as { kind?: unknown }).kind === "response" &&
		(message as { id?: unknown }).id === id
	);
}

function expectRouteResult(method: keyof typeof ClientRequestResultSchemas, response: unknown): void {
	expect(isResponse(response, (response as { id?: string })?.id ?? "")).toBe(true);
	const message = response as { ok: boolean; result: unknown };
	expect(message.ok).toBe(true);
	expectResultShape(method, message.result);
}

function expectResultShape(method: keyof typeof ClientRequestResultSchemas, result: unknown): void {
	expect(Value.Check(ClientRequestResultSchemas[method], result)).toBe(true);
}

async function waitFor<T>(fn: () => T | undefined | false, timeoutMs = 2000): Promise<T> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const value = fn();
		if (value) return value;
		await Bun.sleep(20);
	}
	throw new Error("Timed out waiting for condition");
}
