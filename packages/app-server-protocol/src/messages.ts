import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { EventReplayParamsSchema, EventReplayResultSchema } from "./events";
import { ExtensionUiRequestSchema, ExtensionUiResponseSchema } from "./extension-ui";
import {
	ApprovalIdSchema,
	CheckpointIdSchema,
	DiffIdSchema,
	ProjectIdSchema,
	ProtocolVersionSchema,
	RequestIdSchema,
	SessionIdSchema,
	TerminalIdSchema,
	TurnIdSchema,
	WorktreeIdSchema,
} from "./ids";

const EmptyParamsSchema = Type.Object({});
const JsonObjectSchema = Type.Record(Type.String(), Type.Unknown());

const request = <Method extends string, Params extends TSchema>(method: Method, params: Params) =>
	Type.Object({
		kind: Type.Literal("request"),
		id: RequestIdSchema,
		method: Type.Literal(method),
		params,
	});

const notification = <Method extends string, Params extends TSchema>(method: Method, params: Params) =>
	Type.Object({
		kind: Type.Literal("notification"),
		method: Type.Literal(method),
		params,
	});

export const InitializeParamsSchema = Type.Object({
	protocolVersion: ProtocolVersionSchema,
	client: Type.Object({ name: Type.String({ minLength: 1 }), version: Type.Optional(Type.String()) }),
});
export type InitializeParams = Static<typeof InitializeParamsSchema>;

export const InitializeResultSchema = Type.Object({
	protocolVersion: ProtocolVersionSchema,
	server: Type.Object({ name: Type.String({ minLength: 1 }), version: Type.String() }),
	capabilities: Type.Record(Type.String(), Type.Boolean()),
});
export type InitializeResult = Static<typeof InitializeResultSchema>;

export const SessionStartParamsSchema = Type.Object({
	projectId: ProjectIdSchema,
	worktreeId: Type.Optional(WorktreeIdSchema),
	prompt: Type.String({ minLength: 1 }),
	model: Type.Optional(Type.String()),
});
export type SessionStartParams = Static<typeof SessionStartParamsSchema>;

export const TurnStartParamsSchema = Type.Object({
	sessionId: SessionIdSchema,
	prompt: Type.String({ minLength: 1 }),
});
export type TurnStartParams = Static<typeof TurnStartParamsSchema>;

export const ClientRequestSchema = Type.Union([
	request("initialize", InitializeParamsSchema),
	request("project/list", EmptyParamsSchema),
	request("project/open", Type.Object({ path: Type.String({ minLength: 1 }) })),
	request("worktree/list", Type.Object({ projectId: ProjectIdSchema })),
	request("worktree/create", Type.Object({ projectId: ProjectIdSchema, branch: Type.String({ minLength: 1 }) })),
	request("session/start", SessionStartParamsSchema),
	request("session/stop", Type.Object({ sessionId: SessionIdSchema })),
	request("session/list", Type.Object({ projectId: Type.Optional(ProjectIdSchema) })),
	request("turn/start", TurnStartParamsSchema),
	request("turn/cancel", Type.Object({ sessionId: SessionIdSchema, turnId: TurnIdSchema })),
	request(
		"approval/respond",
		Type.Object({
			approvalId: ApprovalIdSchema,
			decision: Type.Union([Type.Literal("approved"), Type.Literal("denied")]),
			message: Type.Optional(Type.String()),
		}),
	),
	request("extension/ui/respond", ExtensionUiResponseSchema),
	request("checkpoint/list", Type.Object({ sessionId: SessionIdSchema })),
	request("checkpoint/restore", Type.Object({ sessionId: SessionIdSchema, checkpointId: CheckpointIdSchema })),
	request("diff/get", Type.Object({ diffId: DiffIdSchema })),
	request(
		"terminal/create",
		Type.Object({
			projectId: Type.Optional(ProjectIdSchema),
			worktreeId: Type.Optional(WorktreeIdSchema),
			cwd: Type.String({ minLength: 1 }),
			shell: Type.Optional(Type.String({ minLength: 1 })),
			cols: Type.Optional(Type.Integer({ minimum: 1 })),
			rows: Type.Optional(Type.Integer({ minimum: 1 })),
		}),
	),
	request(
		"terminal/list",
		Type.Object({ projectId: Type.Optional(ProjectIdSchema), worktreeId: Type.Optional(WorktreeIdSchema) }),
	),
	request("terminal/attach", Type.Object({ terminalId: TerminalIdSchema })),
	request("terminal/detach", Type.Object({ terminalId: TerminalIdSchema })),
	request("terminal/input", Type.Object({ terminalId: TerminalIdSchema, data: Type.String() })),
	request(
		"terminal/resize",
		Type.Object({
			terminalId: TerminalIdSchema,
			cols: Type.Integer({ minimum: 1 }),
			rows: Type.Integer({ minimum: 1 }),
		}),
	),
	request("terminal/kill", Type.Object({ terminalId: TerminalIdSchema })),
	request(
		"terminal/replay",
		Type.Object({ terminalId: TerminalIdSchema, afterSeq: Type.Optional(Type.Integer({ minimum: 0 })) }),
	),
	request("config/get", Type.Object({ key: Type.Optional(Type.String()) })),
	request("config/set", Type.Object({ key: Type.String({ minLength: 1 }), value: Type.Unknown() })),
	request("model/list", EmptyParamsSchema),
	request("model/select", Type.Object({ model: Type.String({ minLength: 1 }) })),
	request("auth/status", Type.Object({ provider: Type.Optional(Type.String()) })),
	request("auth/login", Type.Object({ provider: Type.String({ minLength: 1 }) })),
	request("integration/list", Type.Object({ projectId: Type.Optional(ProjectIdSchema) })),
	request(
		"integration/connect",
		Type.Object({
			provider: Type.String({ minLength: 1 }),
			projectId: Type.Optional(ProjectIdSchema),
			config: Type.Optional(JsonObjectSchema),
		}),
	),
	request(
		"integration/disconnect",
		Type.Object({ provider: Type.String({ minLength: 1 }), projectId: Type.Optional(ProjectIdSchema) }),
	),
	request(
		"integration/link",
		Type.Object({
			provider: Type.String({ minLength: 1 }),
			projectId: Type.Optional(ProjectIdSchema),
			url: Type.String({ minLength: 1 }),
			kind: Type.Optional(Type.String()),
		}),
	),
	request(
		"integration/import",
		Type.Object({
			provider: Type.String({ minLength: 1 }),
			projectId: Type.Optional(ProjectIdSchema),
			source: Type.String({ minLength: 1 }),
		}),
	),
	request(
		"diagnostics/export",
		Type.Object({
			sessionId: Type.Optional(SessionIdSchema),
			includeTranscripts: Type.Optional(Type.Boolean()),
			includeToolLogs: Type.Optional(Type.Boolean()),
			recentEventLimit: Type.Optional(Type.Integer({ minimum: 1 })),
		}),
	),
	request("orchestration/read", EmptyParamsSchema),
	request(
		"audit/query",
		Type.Object({
			sessionId: Type.Optional(SessionIdSchema),
			kinds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
			text: Type.Optional(Type.String()),
			limit: Type.Optional(Type.Integer({ minimum: 1 })),
		}),
	),
	request("automation/read", EmptyParamsSchema),
	request("event/replay", EventReplayParamsSchema),
]);
export type ClientRequest = Static<typeof ClientRequestSchema>;

export const ResponseErrorSchema = Type.Object({
	code: Type.String({ minLength: 1 }),
	message: Type.String(),
	data: Type.Optional(Type.Unknown()),
});
export type ResponseError = Static<typeof ResponseErrorSchema>;

export const ServerResponseSchema = Type.Union([
	Type.Object({ kind: Type.Literal("response"), id: RequestIdSchema, ok: Type.Literal(true), result: Type.Unknown() }),
	Type.Object({
		kind: Type.Literal("response"),
		id: RequestIdSchema,
		ok: Type.Literal(false),
		error: ResponseErrorSchema,
	}),
]);
export type ServerResponse = Static<typeof ServerResponseSchema>;

export const ServerRequestSchema = Type.Union([request("extension/ui/request", ExtensionUiRequestSchema)]);
export type ServerRequest = Static<typeof ServerRequestSchema>;

export const ServerNotificationSchema = Type.Union([
	notification("project/changed", Type.Object({ projectId: ProjectIdSchema })),
	notification("worktree/changed", Type.Object({ worktreeId: WorktreeIdSchema })),
	notification("session/changed", Type.Object({ sessionId: SessionIdSchema, status: Type.String() })),
	notification(
		"turn/changed",
		Type.Object({ sessionId: SessionIdSchema, turnId: TurnIdSchema, status: Type.String() }),
	),
	notification(
		"approval/requested",
		Type.Object({ approvalId: ApprovalIdSchema, sessionId: SessionIdSchema, summary: Type.String() }),
	),
	notification("extension/ui/cancelled", Type.Object({ requestId: Type.String({ minLength: 1 }) })),
	notification("checkpoint/created", Type.Object({ checkpointId: CheckpointIdSchema, sessionId: SessionIdSchema })),
	notification("diff/changed", Type.Object({ diffId: DiffIdSchema })),
	notification(
		"terminal/output",
		Type.Object({ terminalId: TerminalIdSchema, seq: Type.Integer({ minimum: 1 }), data: Type.String() }),
	),
	notification("terminal/closed", Type.Object({ terminalId: TerminalIdSchema, status: Type.String() })),
	notification("config/changed", Type.Object({ key: Type.String() })),
	notification("model/changed", Type.Object({ model: Type.String() })),
	notification("auth/changed", Type.Object({ provider: Type.String(), authenticated: Type.Boolean() })),
	notification("integration/changed", Type.Object({ provider: Type.String(), status: Type.String() })),
	notification("event/appended", Type.Object({ event: Type.Unknown() })),
]);
export type ServerNotification = Static<typeof ServerNotificationSchema>;

export const ClientNotificationSchema = Type.Union([
	notification("terminal/closed", Type.Object({ terminalId: TerminalIdSchema })),
	notification("extension/ui/closed", Type.Object({ requestId: Type.String({ minLength: 1 }) })),
]);
export type ClientNotification = Static<typeof ClientNotificationSchema>;

export const EventReplayResponseSchema = Type.Object({
	kind: Type.Literal("response"),
	id: RequestIdSchema,
	ok: Type.Literal(true),
	result: EventReplayResultSchema,
});
export type EventReplayResponse = Static<typeof EventReplayResponseSchema>;
