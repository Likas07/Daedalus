import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
	AuditDetailWindowParamsSchema,
	DiffContentWindowParamsSchema,
	PayloadReferenceSchema,
	ReplayCursorSchema,
	TerminalOutputWindowParamsSchema,
	TimelineEntrySchema,
	TimelineWindowParamsSchema,
	TimelineWindowResultSchema,
	ToolOutputWindowParamsSchema,
} from "./index";

describe("Protocol v1 timeline contracts", () => {
	const createdAt = new Date(0).toISOString();
	const baseEntry = {
		entryId: "entry-1",
		threadId: "thread-1",
		turnId: "turn-1",
		sequence: 12,
		createdAt,
	};

	test("TimelineEntry is an ordered thread-scoped render index", () => {
		const entry = {
			...baseEntry,
			kind: "assistant-message",
			role: "assistant",
			content: "Done.",
		};

		expect(Value.Check(TimelineEntrySchema, entry)).toBe(true);
		expect(Value.Check(TimelineEntrySchema, { ...entry, sequence: -1 })).toBe(false);
		expect(Value.Check(TimelineEntrySchema, { ...entry, sessionId: "session-1" })).toBe(false);
	});

	test("terminal timeline entry references a payload window instead of embedding output", () => {
		const entry = {
			...baseEntry,
			kind: "terminal-output",
			payloadRef: { kind: "terminal-output", terminalId: "terminal-1", cursor: { seq: 10 }, byteLength: 4096 },
		};

		expect(Value.Check(TimelineEntrySchema, entry)).toBe(true);
		expect(Value.Check(TimelineEntrySchema, { ...entry, output: "huge raw terminal output" })).toBe(false);
	});

	test("diff timeline entry references windowed content instead of embedding patches", () => {
		const entry = {
			...baseEntry,
			kind: "diff",
			diffId: "diff-1",
			title: "Working tree changes",
			filesChanged: 3,
			insertions: 42,
			deletions: 7,
			payloadRef: { kind: "diff-content", diffId: "diff-1", byteLength: 8192 },
		};

		expect(Value.Check(TimelineEntrySchema, entry)).toBe(true);
		expect(Value.Check(TimelineEntrySchema, { ...entry, patch: "diff --git ..." })).toBe(false);
	});

	test("tool timeline entry references long output instead of embedding output", () => {
		const entry = {
			...baseEntry,
			kind: "tool",
			toolCallId: "tool-call-1",
			toolName: "bash",
			status: "completed",
			summary: "Command completed",
			payloadRef: { kind: "tool-output", toolCallId: "tool-call-1", cursor: { seq: 0 }, byteLength: 2048 },
		};

		expect(Value.Check(TimelineEntrySchema, entry)).toBe(true);
		expect(Value.Check(TimelineEntrySchema, { ...entry, stdout: "large command output" })).toBe(false);
	});

	test("audit/detail timeline entry references details instead of embedding them", () => {
		const entry = {
			...baseEntry,
			kind: "system-event",
			eventType: "audit.detail",
			message: "Audit detail available",
			payloadRef: { kind: "audit-detail", auditId: "audit-1", byteLength: 512, contentType: "application/json" },
		};

		expect(Value.Check(TimelineEntrySchema, entry)).toBe(true);
		expect(Value.Check(TimelineEntrySchema, { ...entry, details: { risk: "high" } })).toBe(false);
	});

	test("TimelineEntry covers render variants used by the GUI", () => {
		const variants = [
			{ ...baseEntry, entryId: "entry-user", kind: "user-message", role: "user", content: "Build it" },
			{ ...baseEntry, entryId: "entry-assistant", kind: "assistant-message", role: "assistant", content: "Working" },
			{ ...baseEntry, entryId: "entry-activity", kind: "activity", status: "running", title: "Thinking" },
			{
				...baseEntry,
				entryId: "entry-tool",
				kind: "tool",
				toolCallId: "tool-call-1",
				toolName: "read",
				status: "running",
			},
			{
				...baseEntry,
				entryId: "entry-terminal",
				kind: "terminal-output",
				payloadRef: { kind: "terminal-output", terminalId: "terminal-1", cursor: { seq: 1 }, byteLength: 1 },
			},
			{
				...baseEntry,
				entryId: "entry-approval",
				kind: "approval",
				approvalId: "approval-1",
				status: "pending",
				title: "Allow command",
			},
			{
				...baseEntry,
				entryId: "entry-diff",
				kind: "diff",
				diffId: "diff-1",
				title: "Diff",
				filesChanged: 1,
				payloadRef: { kind: "diff-content", diffId: "diff-1", byteLength: 10 },
			},
			{ ...baseEntry, entryId: "entry-plan", kind: "plan", planId: "plan-1", status: "active", title: "Plan" },
			{ ...baseEntry, entryId: "entry-safety", kind: "safety", level: "warning", message: "Needs approval" },
			{
				...baseEntry,
				entryId: "entry-system",
				kind: "system-event",
				eventType: "thread.restored",
				message: "Restored",
			},
			{ ...baseEntry, entryId: "entry-recovery", kind: "recovery-event", status: "restored", message: "Recovered" },
		];

		for (const variant of variants) {
			expect(Value.Check(TimelineEntrySchema, variant)).toBe(true);
		}
	});

	test("ReplayCursor and TimelineWindow support before/after direction and next/previous cursors", () => {
		expect(Value.Check(ReplayCursorSchema, { seq: 42 })).toBe(true);
		expect(Value.Check(ReplayCursorSchema, { seq: -1 })).toBe(false);

		const params = {
			threadId: "thread-1",
			after: { seq: 10 },
			direction: "forward",
			limit: 50,
		};
		expect(Value.Check(TimelineWindowParamsSchema, params)).toBe(true);
		expect(Value.Check(TimelineWindowParamsSchema, { ...params, before: { seq: 20 }, direction: "backward" })).toBe(
			true,
		);
		expect(Value.Check(TimelineWindowParamsSchema, { ...params, sessionId: "session-1" })).toBe(false);

		expect(
			Value.Check(TimelineWindowResultSchema, {
				threadId: "thread-1",
				entries: [
					{
						entryId: "entry-1",
						threadId: "thread-1",
						sequence: 11,
						createdAt,
						kind: "user-message",
						role: "user",
						content: "Continue",
					},
				],
				nextCursor: { seq: 12 },
				previousCursor: { seq: 10 },
				hasMoreAfter: true,
				hasMoreBefore: true,
			}),
		).toBe(true);
	});

	test("payload references cover terminal diff tool and audit details", () => {
		const refs = [
			{ kind: "terminal-output", terminalId: "terminal-1", cursor: { seq: 10 }, byteLength: 4096 },
			{ kind: "diff-content", diffId: "diff-1", filePath: "src/index.ts", byteLength: 8192 },
			{ kind: "tool-output", toolCallId: "tool-call-1", cursor: { seq: 2 }, byteLength: 2048 },
			{ kind: "audit-detail", auditId: "audit-1", byteLength: 512, contentType: "application/json" },
		];

		for (const ref of refs) {
			expect(Value.Check(PayloadReferenceSchema, ref)).toBe(true);
			expect(Value.Check(PayloadReferenceSchema, { ...ref, sessionId: "session-1" })).toBe(false);
		}
	});

	test("payload window params are scoped by threadId and reject sessionId", () => {
		const windows = [
			{
				schema: TerminalOutputWindowParamsSchema,
				value: {
					threadId: "thread-1",
					terminalId: "terminal-1",
					after: { seq: 1 },
					direction: "forward",
					limit: 100,
				},
			},
			{
				schema: DiffContentWindowParamsSchema,
				value: { threadId: "thread-1", diffId: "diff-1", before: { seq: 10 }, direction: "backward", limit: 25 },
			},
			{
				schema: ToolOutputWindowParamsSchema,
				value: { threadId: "thread-1", toolCallId: "tool-call-1", after: { seq: 0 }, limit: 50 },
			},
			{
				schema: AuditDetailWindowParamsSchema,
				value: { threadId: "thread-1", auditId: "audit-1", after: { seq: 0 }, limit: 50 },
			},
		];

		for (const { schema, value } of windows) {
			expect(Value.Check(schema, value)).toBe(true);
			expect(Value.Check(schema, { ...value, sessionId: "session-1" })).toBe(false);
		}
	});
});
