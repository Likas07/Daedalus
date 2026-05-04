import { describe, expect, it } from "vitest";

import type { T3CompatibleEnvironment } from "./daedalusBootstrap";
import { createDaedalusGuiClient } from "./daedalusClient";

class FakeWebSocket extends EventTarget {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	static instances: FakeWebSocket[] = [];

	readonly url: string;
	readonly protocols?: string | string[];
	readyState = FakeWebSocket.OPEN;
	sent: string[] = [];

	constructor(url: string, protocols?: string | string[]) {
		super();
		this.url = url;
		this.protocols = protocols;
		FakeWebSocket.instances.push(this);
		queueMicrotask(() => this.dispatchEvent(new Event("open")));
	}

	send(message: string): void {
		this.sent.push(message);
	}

	close(): void {
		this.readyState = FakeWebSocket.CLOSED;
	}
}

const environment: T3CompatibleEnvironment = {
	id: "local-daedalus",
	label: "Daedalus Local",
	httpUrl: "http://127.0.0.1:4777",
	wsUrl: "ws://127.0.0.1:4777/rpc",
	token: "test-token",
	projectRoot: "/repo",
	authenticated: true,
};

describe("createDaedalusGuiClient", () => {
	it("creates an app-server client over the environment WebSocket endpoint", async () => {
		FakeWebSocket.instances = [];
		const { client, transport } = createDaedalusGuiClient(environment, {
			WebSocketImpl: FakeWebSocket as never,
		});

		expect(FakeWebSocket.instances).toHaveLength(1);
		expect(FakeWebSocket.instances[0]?.url).toBe(environment.wsUrl);
		expect(FakeWebSocket.instances[0]?.protocols).toEqual(["daedalus", "bearer.test-token"]);

		await transport.send({ kind: "notification", method: "test", params: {} });
		expect(FakeWebSocket.instances[0]?.sent).toEqual([
			JSON.stringify({ kind: "notification", method: "test", params: {} }),
		]);
		expect(client).toBeDefined();
	});
});
