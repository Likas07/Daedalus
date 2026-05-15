import { describe, expect, test } from "bun:test";
import { appServerProtocolVersion } from "@daedalus-pi/app-server-protocol";
import { ProtocolSession } from "./protocol-session";

const makeSession = () => {
	const messages: unknown[] = [];
	const handled: string[] = [];
	const session = new ProtocolSession(
		{
			handle: async (request: { method: string }) => {
				handled.push(request.method);
				if (request.method === "initialize") {
					return { protocolVersion: appServerProtocolVersion, capabilities: {} };
				}
				if (request.method === "project/list") return { projects: [] };
				return {};
			},
			handleNotification: () => {},
		} as never,
		(message) => messages.push(message),
	);
	return { session, messages, handled };
};

describe("stdio protocol session", () => {
	test("malformed JSON does not poison a subsequent valid request", async () => {
		const { session, messages, handled } = makeSession();

		await session.receive("{not json");
		await session.receive(
			JSON.stringify({
				kind: "request",
				id: "init",
				method: "initialize",
				params: { protocolVersion: appServerProtocolVersion, client: { name: "test" } },
			}),
		);
		await session.receive(JSON.stringify({ kind: "request", id: "projects", method: "project/list", params: {} }));

		expect(messages).toMatchObject([
			{ kind: "response", id: "invalid", ok: false, error: { code: "parse_error" } },
			{ kind: "response", id: "init", ok: true },
			{ kind: "response", id: "projects", ok: true, result: { projects: [] } },
		]);
		expect(handled).toEqual(["initialize", "project/list"]);
	});

	test("non-initialize requests before initialize return not_initialized", async () => {
		const { session, messages, handled } = makeSession();

		await session.receive(JSON.stringify({ kind: "request", id: "before", method: "project/list", params: {} }));

		expect(messages).toMatchObject([
			{ kind: "response", id: "before", ok: false, error: { code: "not_initialized" } },
		]);
		expect(handled).toEqual([]);
	});
});
