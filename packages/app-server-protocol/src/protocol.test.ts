import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { appServerProtocolVersion, ClientRequestSchema, EventReplayResponseSchema, ServerRequestSchema } from "./index";

describe("app-server protocol schemas", () => {
	test("validates initialize requests", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-1",
				method: "initialize",
				params: {
					protocolVersion: appServerProtocolVersion,
					client: { name: "gui", version: "0.1.0" },
				},
			}),
		).toBe(true);
	});

	test("validates session/start requests", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-2",
				method: "session/start",
				params: {
					projectId: "project-1",
					worktreeId: "worktree-1",
					prompt: "implement the feature",
					model: "claude-sonnet-4.5",
				},
			}),
		).toBe(true);
	});

	test("validates turn/start requests", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: 3,
				method: "turn/start",
				params: {
					sessionId: "session-1",
					prompt: "continue",
				},
			}),
		).toBe(true);
	});

	test("validates extension UI request and response messages", () => {
		expect(
			Value.Check(ServerRequestSchema, {
				kind: "request",
				id: "server-req-1",
				method: "extension/ui/request",
				params: {
					requestId: "ui-1",
					extensionId: "linear",
					sessionId: "session-1",
					title: "Create issue",
					fields: [{ id: "title", label: "Title", type: "text", required: true }],
					actions: [{ id: "submit", label: "Create", style: "primary" }],
				},
			}),
		).toBe(true);

		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-4",
				method: "extension/ui/respond",
				params: {
					requestId: "ui-1",
					actionId: "submit",
					values: { title: "Fix protocol" },
				},
			}),
		).toBe(true);
	});

	test("validates event/replay requests and typed responses", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-5",
				method: "event/replay",
				params: { cursor: { after: "event-1", limit: 100 }, types: ["session.started"] },
			}),
		).toBe(true);

		expect(
			Value.Check(EventReplayResponseSchema, {
				kind: "response",
				id: "req-5",
				ok: true,
				result: {
					events: [
						{
							id: "event-2",
							type: "session.started",
							ts: "2026-04-24T00:00:00.000Z",
							sessionId: "session-1",
							payload: { sessionId: "session-1" },
						},
					],
					next: { after: "event-2" },
				},
			}),
		).toBe(true);
	});
});
