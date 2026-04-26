import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
	appServerProtocolVersion,
	ClientRequestSchema,
	EventReplayResponseSchema,
	ServerNotificationSchema,
	ServerRequestSchema,
	TerminalSnapshotSchema,
} from "./index";

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

	test("validates GUI composer, access, and terminal contracts", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-composer-search",
				method: "composer/file-search",
				params: { projectId: "project-1", query: "src", limit: 10 },
			}),
		).toBe(true);

		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-attachment",
				method: "composer/attachment/save",
				params: { sessionId: "session-1", filename: "image.png", mimeType: "image/png", dataBase64: "aGVsbG8=" },
			}),
		).toBe(true);

		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-access",
				method: "access/set",
				params: { mode: "unrestricted" },
			}),
		).toBe(true);

		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-terminal",
				method: "terminal/create",
				params: { cwd: "/tmp/project", cols: 80, rows: 24 },
			}),
		).toBe(true);

		expect(
			Value.Check(TerminalSnapshotSchema, {
				terminalId: "terminal-1",
				projectId: "project-1",
				cwd: "/tmp/project",
				cols: 80,
				rows: 24,
				status: "running",
				history: "ready\n",
				updatedAt: "2026-04-25T00:00:00.000Z",
			}),
		).toBe(true);

		expect(
			Value.Check(ServerNotificationSchema, {
				kind: "notification",
				method: "terminal/event",
				params: { terminalId: "terminal-1", event: { type: "data", data: "ready\n" } },
			}),
		).toBe(true);
	});

	test("validates SQLite session store requests", () => {
		const requests = [
			{ method: "session/list", params: { cwd: "/repo", includeArchived: true, limit: 20 } },
			{ method: "session/import-jsonl", params: { content: "{}\n", cwd: "/repo", overwrite: true } },
			{ method: "session/export-jsonl", params: { sessionId: "session-1" } },
			{ method: "session/export-html", params: { sessionId: "session-1" } },
			{ method: "session/resume", params: { sessionId: "session-1", prompt: "continue" } },
			{ method: "session/fork", params: { sessionId: "session-1", cwd: "/repo" } },
			{ method: "session/rename", params: { sessionId: "session-1", name: "New name" } },
			{ method: "session/archive", params: { sessionId: "session-1", archived: true } },
			{ method: "session/delete", params: { sessionId: "session-1" } },
			{ method: "session/stats", params: { sessionId: "session-1" } },
			{ method: "session/tree", params: { rootSessionId: "session-1", includeArchived: false } },
		];
		for (const request of requests) {
			expect(Value.Check(ClientRequestSchema, { kind: "request", id: `req-${request.method}`, ...request })).toBe(true);
		}
	});

	test("validates runtime control requests", () => {
		const requests = [
			{ method: "runtime/get-state", params: { sessionId: "session-1" } },
			{ method: "runtime/set-model", params: { sessionId: "session-1", provider: "openai", modelId: "gpt-5" } },
			{ method: "runtime/cycle-model", params: { sessionId: "session-1" } },
			{ method: "runtime/set-thinking", params: { sessionId: "session-1", level: "high" } },
			{ method: "runtime/cycle-thinking", params: { sessionId: "session-1" } },
			{ method: "runtime/set-tools", params: { sessionId: "session-1", tools: ["read", "grep"] } },
			{ method: "runtime/set-steering-mode", params: { sessionId: "session-1", mode: "one-at-a-time" } },
			{ method: "runtime/set-follow-up-mode", params: { sessionId: "session-1", mode: "all" } },
			{ method: "runtime/compact", params: { sessionId: "session-1", customInstructions: "keep plan" } },
			{ method: "runtime/abort", params: { sessionId: "session-1" } },
			{ method: "runtime/reload-resources", params: { sessionId: "session-1" } },
			{ method: "runtime/get-commands", params: { sessionId: "session-1" } },
			{ method: "runtime/get-keybindings", params: {} },
		];
		for (const request of requests) {
			expect(Value.Check(ClientRequestSchema, { kind: "request", id: `req-${request.method}`, ...request })).toBe(true);
		}
	});
	test("rejects invalid GUI protocol values", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-bad-access",
				method: "access/set",
				params: { mode: "yolo" },
			}),
		).toBe(false);

		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-bad-terminal",
				method: "terminal/resize",
				params: { terminalId: "terminal-1", cols: 5, rows: 2 },
			}),
		).toBe(false);

		expect(
			Value.Check(TerminalSnapshotSchema, {
				terminalId: "terminal-1",
				cwd: "/tmp/project",
				cols: 10,
				rows: 2,
				status: "running",
				history: "",
				updatedAt: "2026-04-25T00:00:00.000Z",
			}),
		).toBe(false);
	});
});
