import { expect, test } from "bun:test";
import type { AppEvent, ClientRequest } from "@daedalus-pi/app-server-protocol";
import { AppServerClient, AppServerResponseError } from "./client";
import { createInProcessTransport } from "./in-process-transport";

test("correlates requests and rejects failed responses", async () => {
	const client = new AppServerClient({
		transport: createInProcessTransport((message, send) => {
			const request = message as ClientRequest;
			if (request.method === "initialize")
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: { protocolVersion: "0.1.0", server: { name: "test", version: "0" }, capabilities: {} },
				});
			else send({ kind: "response", id: request.id, ok: false, error: { code: "nope", message: "Nope" } });
		}),
	});

	await expect(client.initialize({ protocolVersion: "0.1.0", client: { name: "test" } })).resolves.toMatchObject({
		server: { name: "test" },
	});
	await expect(client.request("project/list", {})).rejects.toBeInstanceOf(AppServerResponseError);
	await client.close();
});

test("dispatches typed extension UI server requests and response helper", async () => {
	let sendToClient: ((message: unknown) => void) | undefined;
	let responseSeen = false;
	const client = new AppServerClient({
		transport: createInProcessTransport((message, send) => {
			sendToClient = send;
			const request = message as ClientRequest;
			if (request.method === "extension/ui/respond") {
				responseSeen = request.params.requestId === "ui-1" && request.params.actionId === "ok";
				send({ kind: "response", id: request.id, ok: true, result: {} });
				return;
			}
			send({ kind: "response", id: request.id, ok: true, result: {} });
		}),
	});

	const seen = new Promise<string>((resolve) => {
		client.onExtensionUiRequest((request) => resolve(request.title));
	});
	await client.request("project/list", {}).catch(() => undefined);
	sendToClient?.({
		kind: "request",
		id: "server-1",
		method: "extension/ui/request",
		params: {
			requestId: "ui-1",
			extensionId: "ext-1",
			title: "Need input",
			fields: [],
			actions: [{ id: "ok", label: "OK" }],
		},
	});
	await expect(seen).resolves.toBe("Need input");
	await client.respondToExtensionUi({ requestId: "ui-1", actionId: "ok", values: {} });
	expect(responseSeen).toBe(true);
	await client.close();
});

test("reconnect replays missed events once", async () => {
	const server = new ReplayServer();
	const firstTransport = createInProcessTransport(server.handle);
	const client = new AppServerClient({ transport: firstTransport });
	const delivered: string[] = [];
	client.onNotification("event/appended", (params) => {
		const event = params.event as AppEvent & { seq?: number };
		delivered.push(event.id);
	});

	await client.initialize({ protocolVersion: "0.1.0", client: { name: "test" } });
	await client.startSession({ projectId: "project-1", prompt: "hello" });
	expect(delivered).toEqual(["event-1"]);

	firstTransport.close();
	server.append("event-2");

	await client.reconnect(createInProcessTransport(server.handle));
	expect(delivered).toEqual(["event-1", "event-2"]);

	await client.reconnect(createInProcessTransport(server.handle));
	expect(delivered).toEqual(["event-1", "event-2"]);
	await client.close();
});

class ReplayServer {
	private events: Array<AppEvent & { seq: number }> = [];
	private send: ((message: unknown) => void) | undefined;

	readonly handle = (message: unknown, send: (message: unknown) => void) => {
		this.send = send;
		const request = message as ClientRequest;
		if (request.method === "initialize") {
			send({
				kind: "response",
				id: request.id,
				ok: true,
				result: {
					protocolVersion: "0.1.0",
					server: { name: "test", version: "0" },
					capabilities: { events: true },
				},
			});
			return;
		}
		if (request.method === "session/start") {
			this.append("event-1");
			send({ kind: "response", id: request.id, ok: true, result: { sessionId: "session-1" } });
			return;
		}
		if (request.method === "event/replay") {
			const after = Number(request.params.cursor?.after ?? 0);
			const events = this.events.filter((event) => event.seq > after);
			send({
				kind: "response",
				id: request.id,
				ok: true,
				result: { events, next: events.length ? { after: String(events.at(-1)?.seq) } : undefined },
			});
			return;
		}
		send({ kind: "response", id: request.id, ok: true, result: {} });
	};

	append(id: string): void {
		const event = {
			id,
			seq: this.events.length + 1,
			type: "session/started",
			ts: new Date().toISOString(),
			sessionId: "session-1",
			payload: {},
		};
		this.events.push(event);
		this.send?.({ kind: "notification", method: "event/appended", params: { event } });
	}
}
