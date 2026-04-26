import { afterEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppServerInstance, openAppServerDatabase, readEvents, startAppServer } from "..";

const servers: AppServerInstance[] = [];
afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.stop()));
});

test("app server accepts websocket protocol requests and persists events", async () => {
	const dir = mkdtempSync(join(tmpdir(), "daedalus-app-server-"));
	const db = join(dir, "app.sqlite");
	const server = await startAppServer({ databasePath: db, token: "test-token" });
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
			params: { protocolVersion: "1", client: { name: "test" } },
		}),
	);
	await waitFor(() => messages.some((message) => isResponse(message, "1")));

	ws.send(JSON.stringify({ kind: "request", id: "2", method: "project/open", params: { path: dir } }));
	const open = (await waitFor(() => messages.find((message) => isResponse(message, "2")))) as {
		result: { projectId: string };
	};

	ws.send(
		JSON.stringify({
			kind: "request",
			id: "3",
			method: "session/start",
			params: { projectId: open.result.projectId, prompt: "hello" },
		}),
	);
	await waitFor(() => messages.some((message) => isResponse(message, "3")));
	await waitFor(() => readEvents(openAppServerDatabase(db)).some((event) => event.type === "session/started"));

	const database = openAppServerDatabase(db);
	const events = readEvents(database);
	database.close();
	expect(events.map((event) => event.type)).toContain("project/registered");
	expect(events.map((event) => event.type)).toContain("session/started");
	expect(events.map((event) => event.type)).toContain("turn/started");
	ws.close();
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
				onData: (listener) => { onData = listener; return () => {}; },
				onExit: (listener) => { onExit = listener; return () => {}; },
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
	const request = (id: string, method: string, params: unknown) => ws.send(JSON.stringify({ kind: "request", id, method, params }));
	request("1", "terminal/create", { cwd: dir, cols: 80, rows: 24 });
	const created = (await waitFor(() => messages.find((message) => isResponse(message, "1")))) as { result: { terminal: { id: string } } };
	const terminalId = created.result.terminal.id;
	onData("hello\n");
	request("2", "terminal/input", { terminalId, data: "pwd\n" });
	await waitFor(() => messages.some((message) => isResponse(message, "2")));
	request("3", "terminal/resize", { terminalId, cols: 100, rows: 40 });
	await waitFor(() => messages.some((message) => isResponse(message, "3")));
	request("4", "terminal/replay", { terminalId, afterSeq: 0 });
	const replay = (await waitFor(() => messages.find((message) => isResponse(message, "4")))) as { result: { chunks: Array<{ data: string }> } };
	request("5", "terminal/kill", { terminalId });
	const killed = (await waitFor(() => messages.find((message) => isResponse(message, "5")))) as { result: { terminal: { status: string } } };
	expect(writes).toEqual(["pwd\n"]);
	expect(resizes).toEqual([[100, 40]]);
	expect(replay.result.chunks.map((chunk) => chunk.data)).toEqual(["hello\n"]);
	expect(killed.result.terminal.status).toBe("killed");
	expect(messages).toContainEqual({ kind: "notification", method: "terminal/output", params: { terminalId, seq: 1, data: "hello\n" } });
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

async function waitFor<T>(fn: () => T | undefined | false, timeoutMs = 2000): Promise<T> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const value = fn();
		if (value) return value;
		await Bun.sleep(20);
	}
	throw new Error("Timed out waiting for condition");
}
