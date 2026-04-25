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
