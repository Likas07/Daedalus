import { describe, expect, test } from "bun:test";
import { protocolV1 } from "@daedalus-pi/app-server-protocol";
import { Value } from "@sinclair/typebox/value";
import { type AppServerDatabase, openAppServerDatabase } from "../../persistence/database";
import { appendEvent, type EventPayload, type StoredEvent } from "../../persistence/event-store";
import { runMigrations } from "../../persistence/migrations";
import { projectRuntimeEvents } from "../../persistence/projector";
import { replayThreadV1 } from "../../projections/thread-v1-projection";
import { notificationForThreadV1StoredEvent } from "../thread-v1-routes";

interface GoldenEvent {
	readonly type: string;
	readonly payload: EventPayload;
}

interface GoldenScenario {
	readonly name: string;
	readonly events: readonly GoldenEvent[];
	readonly expectedReplayEntryIds?: readonly string[];
	readonly hiddenReplayEntryIds?: readonly string[];
}

type TimelineNotification = NonNullable<ReturnType<typeof notificationForThreadV1StoredEvent>>;

const threadId = "thread-golden";

function event(type: string, payload: Record<string, EventPayload>): GoldenEvent {
	return { type, payload: { sessionId: threadId, ...payload } };
}

function turnStarted(turnId: string, prompt: string): GoldenEvent {
	return event("turn/started", { turnId, prompt });
}

function assistantDelta(turnId: string, messageId: string, delta: string): GoldenEvent {
	return event("agent/message_delta", { turnId, messageId, delta });
}

function assistantEnd(turnId: string, messageId: string, content: string): GoldenEvent {
	return event("agent/message_end", { turnId, messageId, role: "assistant", content });
}

function toolDelta(turnId: string, toolCallId: string, delta: string): GoldenEvent {
	return event("agent/tool_delta", { turnId, toolCallId, toolName: "shell", delta });
}

function toolEnd(turnId: string, toolCallId: string, output: string): GoldenEvent {
	return event("agent/tool_end", {
		turnId,
		toolCallId,
		toolName: "shell",
		status: "completed",
		output,
	});
}

function turnCompleted(turnId: string): GoldenEvent {
	return event("turn/completed", { turnId });
}

function turnCancelled(turnId: string): GoldenEvent {
	return event("turn/interrupted", { turnId });
}

function approvalRequested(turnId: string, approvalId: string, kind: "command" | "answer-input"): GoldenEvent {
	const request: Record<string, EventPayload> = {
		kind,
		turnId,
		workspaceTargetId: "target-1",
		title: kind === "command" ? "Run command" : "Need structured input",
	};
	if (kind === "answer-input") request.question = "Which branch?";
	return event("approval/requested", {
		turnId,
		approvalId,
		workspaceTargetId: "target-1",
		kind,
		request,
	});
}

function approvalResolved(turnId: string, approvalId: string, status = "approved"): GoldenEvent {
	return event("approval/resolved", {
		turnId,
		approvalId,
		status,
		workspaceTargetId: "target-1",
	});
}

const scenarios: readonly GoldenScenario[] = [
	{
		name: "simple-assistant-stream",
		events: [
			turnStarted("turn-1", "Hello"),
			assistantDelta("turn-1", "message-1", "Hel"),
			assistantDelta("turn-1", "message-1", "lo "),
			assistantDelta("turn-1", "message-1", "there"),
			assistantEnd("turn-1", "message-1", "Hello there"),
			turnCompleted("turn-1"),
		],
		expectedReplayEntryIds: ["turn:turn-1:user", "message:message-1", "turn:turn-1:completed"],
	},
	{
		name: "assistant-tool-assistant",
		events: [
			turnStarted("turn-1", "Use a tool"),
			assistantDelta("turn-1", "message-before-tool", "Before tool"),
			assistantEnd("turn-1", "message-before-tool", "Before tool"),
			toolDelta("turn-1", "tool-1", "tool chunk 1"),
			toolDelta("turn-1", "tool-1", "tool chunk 2"),
			toolEnd("turn-1", "tool-1", "tool chunk 1\ntool chunk 2"),
			assistantDelta("turn-1", "message-after-tool", "After tool"),
			assistantEnd("turn-1", "message-after-tool", "After tool"),
			turnCompleted("turn-1"),
		],
		expectedReplayEntryIds: [
			"turn:turn-1:user",
			"message:message-before-tool",
			"tool:tool-1",
			"message:message-after-tool",
			"turn:turn-1:completed",
		],
	},
	{
		name: "approval-command",
		events: [
			turnStarted("turn-1", "Run command"),
			approvalRequested("turn-1", "approval-command-1", "command"),
			approvalResolved("turn-1", "approval-command-1"),
			toolDelta("turn-1", "tool-approved", "approved output"),
			toolEnd("turn-1", "tool-approved", "approved output"),
			turnCompleted("turn-1"),
		],
		expectedReplayEntryIds: [
			"turn:turn-1:user",
			"approval:approval-command-1",
			"approval:approval-command-1:resolved",
			"tool:tool-approved",
			"turn:turn-1:completed",
		],
	},
	{
		name: "user-input-request",
		events: [
			turnStarted("turn-1", "Ask input"),
			approvalRequested("turn-1", "approval-input-1", "answer-input"),
			approvalResolved("turn-1", "approval-input-1", "answered"),
			assistantDelta("turn-1", "message-after-input", "Continuing"),
			assistantEnd("turn-1", "message-after-input", "Continuing"),
			turnCompleted("turn-1"),
		],
		expectedReplayEntryIds: [
			"turn:turn-1:user",
			"approval:approval-input-1",
			"approval:approval-input-1:resolved",
			"message:message-after-input",
			"turn:turn-1:completed",
		],
	},
	{
		name: "cancel-during-stream",
		events: [
			turnStarted("turn-1", "Cancel"),
			assistantDelta("turn-1", "message-cancelled", "Partial "),
			assistantDelta("turn-1", "message-cancelled", "text"),
			turnCancelled("turn-1"),
		],
		expectedReplayEntryIds: ["turn:turn-1:user", "turn:turn-1:cancelled"],
		hiddenReplayEntryIds: ["message:message-cancelled"],
	},
	{
		name: "rollback-then-new-turn",
		events: [
			turnStarted("turn-1", "First"),
			assistantEnd("turn-1", "message-turn-1", "First response"),
			turnCompleted("turn-1"),
			turnStarted("turn-2", "Removed"),
			assistantEnd("turn-2", "message-rolled-back", "Removed response"),
			turnCompleted("turn-2"),
			event("thread/rollback", {
				threadId,
				workspaceTargetId: "target-1",
				numTurns: 1,
				removedTurnIds: ["turn-2"],
				hiddenEventRange: null,
			}),
			turnStarted("turn-3", "After rollback"),
			assistantEnd("turn-3", "message-turn-3", "After rollback"),
			turnCompleted("turn-3"),
		],
		expectedReplayEntryIds: [
			"turn:turn-1:user",
			"message:message-turn-1",
			"turn:turn-1:completed",
			"turn:turn-3:user",
			"message:message-turn-3",
			"turn:turn-3:completed",
		],
		hiddenReplayEntryIds: ["turn:turn-2:user", "message:message-rolled-back", "turn:turn-2:completed"],
	},
	{
		name: "reconnect-after-partial-stream",
		events: [
			turnStarted("turn-1", "Reconnect"),
			assistantDelta("turn-1", "message-reconnect", "Part"),
			assistantDelta("turn-1", "message-reconnect", "ial"),
			assistantEnd("turn-1", "message-reconnect", "Partial"),
		],
		expectedReplayEntryIds: ["turn:turn-1:user", "message:message-reconnect"],
	},
];

function seededDatabase(): AppServerDatabase {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	appendEvent(database, {
		streamId: "app",
		type: "project/registered",
		payload: { projectId: "project-1", name: "Project", path: "/repo" },
	});
	appendEvent(database, {
		streamId: "app",
		type: "worktree/registered",
		payload: { worktreeId: "target-1", projectId: "project-1", path: "/repo", branch: "main" },
	});
	appendEvent(database, {
		streamId: threadId,
		type: "session/started",
		payload: {
			sessionId: threadId,
			projectId: "project-1",
			worktreeId: "target-1",
			title: "Golden transcript",
		},
	});
	return database;
}

function appendTranscript(database: AppServerDatabase, scenario: GoldenScenario): StoredEvent[] {
	return scenario.events.map((goldenEvent) =>
		appendEvent(database, { streamId: threadId, type: goldenEvent.type, payload: goldenEvent.payload }),
	);
}

function notificationsFor(events: readonly StoredEvent[]): TimelineNotification[] {
	return events
		.map((storedEvent) => notificationForThreadV1StoredEvent(storedEvent))
		.filter((notification): notification is TimelineNotification => !!notification);
}

function assertNoEmptyRequiredIds(entries: readonly protocolV1.TimelineEntry[]): void {
	for (const entry of entries) {
		expect(entry.entryId.length).toBeGreaterThan(0);
		expect(entry.threadId.length).toBeGreaterThan(0);
		if (entry.kind === "assistant-message" || entry.kind === "user-message") {
			expect(entry.turnId.length).toBeGreaterThan(0);
			expect(entry.messageId.length).toBeGreaterThan(0);
		}
		if (entry.kind === "tool") {
			expect(entry.turnId.length).toBeGreaterThan(0);
			expect(entry.toolCallId.length).toBeGreaterThan(0);
		}
		if (entry.kind === "approval") expect(entry.approvalId.length).toBeGreaterThan(0);
	}
}

function assertNotificationInvariants(notifications: readonly TimelineNotification[]): void {
	const deltaByEntryId = new Map<string, protocolV1.TimelineDeltaNotification[]>();
	const durableByEntryId = new Map<string, protocolV1.TimelineEntryNotification[]>();

	for (const notification of notifications) {
		if (notification.method === "thread.timeline.delta") {
			expect(Value.Check(protocolV1.TimelineDeltaNotificationSchema, notification.params)).toBe(true);
			expect(notification.params.delta).not.toBe("");
			expect(notification.params.entryId).not.toBe("");
			const deltas = deltaByEntryId.get(notification.params.entryId) ?? [];
			deltas.push(notification.params);
			deltaByEntryId.set(notification.params.entryId, deltas);
			continue;
		}
		expect(Value.Check(protocolV1.TimelineEntryNotificationSchema, notification.params)).toBe(true);
		const entries = durableByEntryId.get(notification.params.entry.entryId) ?? [];
		entries.push(notification.params);
		durableByEntryId.set(notification.params.entry.entryId, entries);
	}

	for (const [entryId, deltas] of deltaByEntryId) {
		const durable = durableByEntryId.get(entryId);
		if (!durable) continue;
		const finalSequence = Math.max(...durable.map((entry) => entry.entry.sequence));
		expect(Math.max(...deltas.map((delta) => delta.sequence))).toBeLessThan(finalSequence);
	}
}

function assertReplayInvariants(scenario: GoldenScenario, replay: protocolV1.TimelineWindowResult): void {
	expect(replay.entries.every((entry) => Value.Check(protocolV1.TimelineEntrySchema, entry))).toBe(true);
	expect(new Set(replay.entries.map((entry) => entry.entryId)).size).toBe(replay.entries.length);
	expect(replay.entries.some((entry) => entry.entryId.includes(":delta:"))).toBe(false);
	assertNoEmptyRequiredIds(replay.entries);

	const replayIds = replay.entries.map((entry) => entry.entryId);
	if (scenario.expectedReplayEntryIds) expect(replayIds).toEqual([...scenario.expectedReplayEntryIds]);
	for (const hiddenId of scenario.hiddenReplayEntryIds ?? []) expect(replayIds).not.toContain(hiddenId);

	const assistantEntries = replay.entries.filter((entry) => entry.kind === "assistant-message");
	for (const entry of assistantEntries) expect(entry.entryId).toBe(`message:${entry.messageId}`);
	const toolEntries = replay.entries.filter((entry) => entry.kind === "tool");
	for (const entry of toolEntries) expect(entry.entryId).toBe(`tool:${entry.toolCallId}`);

	const approvalIndexes = new Map<string, number>();
	replay.entries.forEach((entry, index) => {
		if (entry.kind !== "approval") return;
		if (entry.entryId === `approval:${entry.approvalId}`) approvalIndexes.set(entry.approvalId, index);
		if (entry.entryId === `approval:${entry.approvalId}:resolved`) {
			expect(approvalIndexes.get(entry.approvalId)).toBeLessThan(index);
		}
	});
}

describe("v1 golden transcripts", () => {
	for (const scenario of scenarios) {
		test(`${scenario.name} preserves stable notification and replay invariants`, () => {
			const database = seededDatabase();
			try {
				const storedEvents = appendTranscript(database, scenario);
				projectRuntimeEvents(database);
				const notifications = notificationsFor(storedEvents);
				const deltaEventSequences = storedEvents
					.filter((event) => event.type === "agent/message_delta" || event.type === "agent/tool_delta")
					.map((event) => event.seq);
				const replay = replayThreadV1({ database, params: { threadId, limit: 100 } });

				assertNotificationInvariants(notifications);
				assertReplayInvariants(scenario, replay);
				for (const sequence of deltaEventSequences) {
					expect(replay.entries.some((entry) => entry.sequence === sequence)).toBe(false);
				}
			} finally {
				database.close();
			}
		});
	}

	test("reconnect after partial stream returns durable final message without duplicate deltas", () => {
		const scenario = scenarios.find((candidate) => candidate.name === "reconnect-after-partial-stream");
		expect(scenario).toBeDefined();
		const database = seededDatabase();
		try {
			const storedEvents = appendTranscript(database, scenario!);
			projectRuntimeEvents(database);
			const lastDelta = storedEvents.filter((event) => event.type === "agent/message_delta").at(-1);
			expect(lastDelta).toBeDefined();
			const replay = replayThreadV1({
				database,
				params: { threadId, after: { seq: lastDelta!.seq }, limit: 100 },
			});

			expect(replay.entries.map((entry) => entry.entryId)).toEqual(["message:message-reconnect"]);
			expect(replay.entries[0]).toMatchObject({ kind: "assistant-message", content: "Partial" });
		} finally {
			database.close();
		}
	});
});
