import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { AccessModeSchema } from "./access-policy";
import { ComposerAttachmentSaveParamsSchema, ComposerCommandListParamsSchema, ComposerFileSearchParamsSchema } from "./composer";
import { EventReplayParamsSchema, EventReplayResultSchema } from "./events";
import { ExtensionUiRequestSchema, ExtensionUiResponseSchema } from "./extension-ui";
import {
	RuntimeAbortParamsSchema,
	RuntimeCommandsParamsSchema,
	RuntimeCompactParamsSchema,
	RuntimeCycleModelParamsSchema,
	RuntimeCycleThinkingParamsSchema,
	RuntimeKeybindingsParamsSchema,
	RuntimeReloadResourcesParamsSchema,
	RuntimeSetModelParamsSchema,
	RuntimeSetQueueModeParamsSchema,
	RuntimeSetThinkingParamsSchema,
	RuntimeSetToolsParamsSchema,
	RuntimeStateParamsSchema,
} from "./runtime-control";
import {
	SessionArchiveParamsSchema,
	SessionDeleteParamsSchema,
	SessionExportHtmlParamsSchema,
	SessionExportJsonlParamsSchema,
	SessionForkParamsSchema,
	SessionImportJsonlParamsSchema,
	SessionListParamsSchema,
	SessionRenameParamsSchema,
	SessionResumeParamsSchema,
	SessionStatsParamsSchema,
	SessionTreeParamsSchema,
} from "./session-store";
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
const DiagnosticExportKindSchema = Type.Union([
	Type.Literal("support-bundle"),
	Type.Literal("sqlite-session-bundle"),
	Type.Literal("jsonl-session"),
	Type.Literal("html-session"),
]);

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

const PromptContextParamsSchema = Type.Object({
	attachmentIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	filePaths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	model: Type.Optional(Type.String()),
	effort: Type.Optional(Type.String()),
	accessMode: Type.Optional(AccessModeSchema),
	mode: Type.Optional(Type.String()),
	fastMode: Type.Optional(Type.Boolean()),
});

export const SessionStartParamsSchema = Type.Intersect([
	Type.Object({
		projectId: ProjectIdSchema,
		worktreeId: Type.Optional(WorktreeIdSchema),
		prompt: Type.String({ minLength: 1 }),
	}),
	PromptContextParamsSchema,
]);
export type SessionStartParams = Static<typeof SessionStartParamsSchema>;

export const TurnStartParamsSchema = Type.Intersect([
	Type.Object({
		sessionId: SessionIdSchema,
		prompt: Type.String({ minLength: 1 }),
	}),
	PromptContextParamsSchema,
]);
export type TurnStartParams = Static<typeof TurnStartParamsSchema>;


export const ResourceKindSchema = Type.Union([Type.Literal("extension"), Type.Literal("skill"), Type.Literal("prompt-template"), Type.Literal("theme"), Type.Literal("package")]);
export const ResourceOperationParamsSchema = Type.Object({
  kind: ResourceKindSchema,
  id: Type.String({ minLength: 1 }),
  sourcePath: Type.Optional(Type.String({ minLength: 1 })),
});
export const ResourceListResultSchema = Type.Object({ resources: Type.Array(Type.Unknown()), diagnostics: Type.Array(Type.String()) });
export type ResourceListResult = Static<typeof ResourceListResultSchema>;
export type ResourceOperationParams = Static<typeof ResourceOperationParamsSchema>;
export const ClientRequestSchema = Type.Union([
	request("initialize", InitializeParamsSchema),
	request("project/list", EmptyParamsSchema),
	request("project/open", Type.Object({ path: Type.String({ minLength: 1 }) })),
	request("worktree/list", Type.Object({ projectId: ProjectIdSchema })),
	request("worktree/create", Type.Object({ projectId: ProjectIdSchema, branch: Type.String({ minLength: 1 }), path: Type.Optional(Type.String({ minLength: 1 })), baseBranch: Type.Optional(Type.String({ minLength: 1 })) })),
	request("session/start", SessionStartParamsSchema),
	request("session/stop", Type.Object({ sessionId: SessionIdSchema })),
	request("session/list", SessionListParamsSchema),
	request("session/import-jsonl", SessionImportJsonlParamsSchema),
	request("session/export-jsonl", SessionExportJsonlParamsSchema),
	request("session/export-html", SessionExportHtmlParamsSchema),
	request("session/resume", SessionResumeParamsSchema),
	request("session/fork", SessionForkParamsSchema),
	request("session/rename", SessionRenameParamsSchema),
	request("session/archive", SessionArchiveParamsSchema),
	request("session/delete", SessionDeleteParamsSchema),
	request("session/stats", SessionStatsParamsSchema),
	request("session/tree", SessionTreeParamsSchema),
	request("turn/start", TurnStartParamsSchema),
	request("turn/cancel", Type.Object({ sessionId: SessionIdSchema, turnId: TurnIdSchema })),
	request("runtime/get-state", RuntimeStateParamsSchema),
	request("runtime/set-model", RuntimeSetModelParamsSchema),
	request("runtime/cycle-model", RuntimeCycleModelParamsSchema),
	request("runtime/set-thinking", RuntimeSetThinkingParamsSchema),
	request("runtime/cycle-thinking", RuntimeCycleThinkingParamsSchema),
	request("runtime/set-tools", RuntimeSetToolsParamsSchema),
	request("runtime/set-steering-mode", RuntimeSetQueueModeParamsSchema),
	request("runtime/set-follow-up-mode", RuntimeSetQueueModeParamsSchema),
	request("runtime/compact", RuntimeCompactParamsSchema),
	request("runtime/abort", RuntimeAbortParamsSchema),
	request("runtime/reload-resources", RuntimeReloadResourcesParamsSchema),
	request("runtime/get-commands", RuntimeCommandsParamsSchema),
	request("runtime/get-keybindings", RuntimeKeybindingsParamsSchema),
	request("settings/read", EmptyParamsSchema),
	request("settings/set", Type.Object({ scope: Type.Union([Type.Literal("global"), Type.Literal("project")]), key: Type.String({ minLength: 1 }), value: Type.Unknown() })),
	request("settings/reset", Type.Object({ scope: Type.Union([Type.Literal("global"), Type.Literal("project")]), key: Type.String({ minLength: 1 }) })),
	request("settings/reload-resources", EmptyParamsSchema),
	request("resources/list", EmptyParamsSchema),
	request("resources/reload", EmptyParamsSchema),
	request("resources/install", ResourceOperationParamsSchema),
	request("resources/remove", ResourceOperationParamsSchema),
	request("resources/update", ResourceOperationParamsSchema),
	request("resources/enable", ResourceOperationParamsSchema),
	request("resources/disable", ResourceOperationParamsSchema),
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
	request("git/stage", Type.Object({ diffId: DiffIdSchema, paths: Type.Array(Type.String({ minLength: 1 })) })),
	request("git/unstage", Type.Object({ diffId: DiffIdSchema, paths: Type.Array(Type.String({ minLength: 1 })) })),
	request("git/discard", Type.Object({ diffId: DiffIdSchema, paths: Type.Array(Type.String({ minLength: 1 })) })),
	request("git/commit", Type.Object({ diffId: DiffIdSchema, message: Type.String() })),
	request("git/checkpoint-restore", Type.Object({ diffId: DiffIdSchema, checkpointRef: Type.String({ minLength: 1 }) })),
	request("composer/file-search", ComposerFileSearchParamsSchema),
	request("composer/command-list", ComposerCommandListParamsSchema),
	request("composer/attachment/save", ComposerAttachmentSaveParamsSchema),
	request("composer/attachment/get", Type.Object({ attachmentId: Type.String({ minLength: 1 }) })),
	request(
		"terminal/create",
		Type.Object({
			projectId: Type.Optional(ProjectIdSchema),
			worktreeId: Type.Optional(WorktreeIdSchema),
			cwd: Type.String({ minLength: 1 }),
			shell: Type.Optional(Type.String({ minLength: 1 })),
			cols: Type.Optional(Type.Integer({ minimum: 20, maximum: 400 })),
			rows: Type.Optional(Type.Integer({ minimum: 5, maximum: 200 })),
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
			cols: Type.Integer({ minimum: 20, maximum: 400 }),
			rows: Type.Integer({ minimum: 5, maximum: 200 }),
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
	request("auth/logout", Type.Object({ provider: Type.String({ minLength: 1 }) })),
	request("access/get", EmptyParamsSchema),
	request("access/set", Type.Object({ mode: AccessModeSchema })),
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
		"integration/pr-create",
		Type.Object({
			provider: Type.String({ minLength: 1 }),
			projectId: Type.Optional(ProjectIdSchema),
			title: Type.String({ minLength: 1 }),
			body: Type.Optional(Type.String()),
			head: Type.String({ minLength: 1 }),
			base: Type.Optional(Type.String()),
			draft: Type.Optional(Type.Boolean()),
		}),
	),
	request(
		"diagnostics/export",
		Type.Object({
			kind: Type.Optional(DiagnosticExportKindSchema),
			sessionId: Type.Optional(SessionIdSchema),
			includeTranscripts: Type.Optional(Type.Boolean()),
			includeToolLogs: Type.Optional(Type.Boolean()),
			recentEventLimit: Type.Optional(Type.Integer({ minimum: 1 })),
		}),
	),
	request("orchestration/read", EmptyParamsSchema),
	request("daedalus/workflow/read", Type.Object({ sessionId: SessionIdSchema })),
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
	notification("terminal/event", Type.Object({ terminalId: TerminalIdSchema, event: Type.Unknown() })),
	notification("config/changed", Type.Object({ key: Type.String() })),
	notification("model/changed", Type.Object({ model: Type.String() })),
	notification("auth/changed", Type.Object({ provider: Type.String(), authenticated: Type.Boolean() })),
	notification("integration/changed", Type.Object({ provider: Type.String(), status: Type.String() })),
	notification("access/changed", Type.Object({ mode: AccessModeSchema })),
	notification("event/appended", Type.Object({ event: Type.Unknown() })),
	notification("runtime/changed", Type.Object({ sessionId: SessionIdSchema, control: Type.String(), payload: Type.Unknown() })),
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
