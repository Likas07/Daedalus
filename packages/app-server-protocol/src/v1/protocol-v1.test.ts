import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import * as protocolV1 from "./index";
import {
	ProtocolV1ClientRequestSchema,
	ProtocolV1ServerNotificationSchema,
	SafetySignalSchema,
	ThreadCreateParamsSchema,
	ThreadResumeParamsSchema,
	ThreadSchema,
	TurnSchema,
	TurnStartParamsSchema,
	WorkspaceTargetSchema,
} from "./index";

describe("Protocol v1 clean break", () => {
	const updatedAt = new Date(0).toISOString();

	test("v1 index does not export session compatibility aliases", () => {
		const exportedNames = Object.keys(protocolV1);

		expect(exportedNames.some((name) => name.includes("Session"))).toBe(false);
		expect(exportedNames.some((name) => name.includes("session"))).toBe(false);
	});

	test("Thread schema accepts threadId and rejects sessionId", () => {
		const valid = {
			threadId: "thread-1",
			projectId: "project-1",
			workspaceTargetId: "target-1",
			title: "Thread",
			status: "idle",
			updatedAt,
		};

		expect(Value.Check(ThreadSchema, valid)).toBe(true);
		expect(Value.Check(ThreadSchema, { ...valid, sessionId: "session-1" })).toBe(false);
	});

	test("Turn schema is scoped by threadId and rejects sessionId", () => {
		const valid = {
			turnId: "turn-1",
			threadId: "thread-1",
			status: "running",
			prompt: "Continue",
			createdAt: updatedAt,
			updatedAt,
		};

		expect(Value.Check(TurnSchema, valid)).toBe(true);
		expect(Value.Check(TurnSchema, { ...valid, sessionId: "session-1" })).toBe(false);
	});

	test("WorkspaceTarget models base checkout and worktree", () => {
		expect(
			Value.Check(WorkspaceTargetSchema, {
				id: "target-base",
				projectId: "project-1",
				kind: "base-checkout",
				path: "/repo",
				branch: "main",
				validationStatus: "valid",
				dirtyState: "clean",
				activeThreadCount: 0,
				safetySignals: [],
			}),
		).toBe(true);
		expect(
			Value.Check(WorkspaceTargetSchema, {
				id: "target-worktree",
				projectId: "project-1",
				kind: "worktree",
				path: "/repo-wt",
				branch: "feature",
				baseBranch: "main",
				validationStatus: "valid",
				dirtyState: "dirty",
				activeThreadCount: 1,
				safetySignals: [],
			}),
		).toBe(true);
	});

	test("SafetySignal is strict and reusable", () => {
		expect(
			Value.Check(SafetySignalSchema, {
				level: "warning",
				message: "Base checkout requires confirmation",
				code: "base-checkout",
			}),
		).toBe(true);
		expect(
			Value.Check(SafetySignalSchema, {
				level: "warning",
				message: "Base checkout requires confirmation",
				sessionId: "session-1",
			}),
		).toBe(false);
	});

	test("v1 request envelope exposes thread routes only", () => {
		expect(
			Value.Check(ProtocolV1ClientRequestSchema, {
				kind: "request",
				id: "req-thread-create",
				method: "thread.create",
				params: {
					projectId: "project-1",
					workspaceTargetId: "target-1",
					prompt: "Start",
				},
			}),
		).toBe(true);
		expect(
			Value.Check(ProtocolV1ClientRequestSchema, {
				kind: "request",
				id: "req-turn-start",
				method: "turn.start",
				params: { threadId: "thread-1", prompt: "Continue" },
			}),
		).toBe(true);
		expect(
			Value.Check(ProtocolV1ClientRequestSchema, {
				kind: "request",
				id: "req-session-start",
				method: "session/start",
				params: { sessionId: "session-1", prompt: "Start" },
			}),
		).toBe(false);
	});

	test("v1 params reject session compatibility fields", () => {
		expect(
			Value.Check(ThreadCreateParamsSchema, {
				projectId: "project-1",
				workspaceTargetId: "target-1",
				prompt: "Start",
				sessionId: "session-1",
			}),
		).toBe(false);
		expect(
			Value.Check(TurnStartParamsSchema, {
				threadId: "thread-1",
				prompt: "Continue",
				sessionId: "session-1",
			}),
		).toBe(false);
		expect(
			Value.Check(ThreadResumeParamsSchema, {
				threadId: "thread-1",
				prompt: "Continue",
				sessionId: "session-1",
			}),
		).toBe(false);
	});

	test("v1 notification envelope is thread-only", () => {
		expect(
			Value.Check(ProtocolV1ServerNotificationSchema, {
				kind: "notification",
				method: "thread.changed",
				params: { threadId: "thread-1", status: "running" },
			}),
		).toBe(true);
		expect(
			Value.Check(ProtocolV1ServerNotificationSchema, {
				kind: "notification",
				method: "session/changed",
				params: { sessionId: "session-1", status: "running" },
			}),
		).toBe(false);
	});

// Adapter-facing method coverage: if this fails, update both params and result schema maps.
test("v1 adapter-facing methods have params and result schemas", () => {
	const expectedMethods = [
		"initialize",
		"provider.snapshot",
		"workspaceTarget.list",
		"workspaceTarget.validate",
		"thread.create",
		"thread.list",
		"thread.resume",
		"thread.get",
		"thread.replay",
		"thread.rollback",
		"turn.start",
		"turn.cancel",
		"text.threadTitle",
		"text.branchName",
		"text.commitMessage",
		"text.prContent",
	] as const;

	for (const method of expectedMethods) expect(protocolV1.ProtocolV1ClientRequestResultSchemas[method]).toBeTruthy();

	expect(
		Value.Check(ProtocolV1ClientRequestSchema, {
			kind: "request",
			id: "req-provider",
			method: "provider.snapshot",
			params: {},
		}),
	).toBe(true);
	expect(
		Value.Check(ProtocolV1ClientRequestSchema, {
			kind: "request",
			id: "req-rollback",
			method: "thread.rollback",
			params: { threadId: "thread-1", numTurns: 1, workspaceTargetId: "target-1" },
		}),
	).toBe(true);
	expect(
		Value.Check(ProtocolV1ClientRequestSchema, {
			kind: "request",
			id: "req-text",
			method: "text.commitMessage",
			params: { message: "summarize", diff: "diff --git" },
		}),
	).toBe(true);
	expect(
		Value.Check(ProtocolV1ClientRequestSchema, {
			kind: "request",
			id: "req-rollback-session",
			method: "thread.rollback",
			params: { threadId: "thread-1", numTurns: 1, workspaceTargetId: "target-1", sessionId: "session-1" },
		}),
	).toBe(false);
});
});
