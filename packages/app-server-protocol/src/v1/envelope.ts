import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { RequestIdSchema, ThreadIdSchema, TurnIdSchema, WorkspaceTargetIdSchema } from "../ids";
import { PayloadWindowParamsSchema, PayloadWindowResultSchema } from "./payload-windows";
import { ProviderSnapshotParamsSchema, ProviderSnapshotResultSchema } from "./provider";
import { ThreadReplayParamsSchema } from "./replay";
import { ThreadRollbackParamsSchema, ThreadRollbackResultSchema } from "./rollback";
import {
	TextGenerateBranchNameParamsSchema,
	TextGenerateBranchNameResultSchema,
	TextGenerateCommitMessageParamsSchema,
	TextGenerateCommitMessageResultSchema,
	TextGeneratePrContentParamsSchema,
	TextGeneratePrContentResultSchema,
	TextGenerateThreadTitleParamsSchema,
	TextGenerateThreadTitleResultSchema,
} from "./text-generation";
import {
	ThreadCreateParamsSchema,
	ThreadCreateResultSchema,
	ThreadGetParamsSchema,
	ThreadGetResultSchema,
	ThreadListParamsSchema,
	ThreadListResultSchema,
	ThreadResumeParamsSchema,
	ThreadResumeResultSchema,
	ThreadStatusSchema,
	TurnCancelParamsSchema,
	TurnCancelResultSchema,
	TurnStartParamsSchema,
	TurnStartResultSchema,
	TurnStatusSchema,
} from "./thread";
import { TimelineDeltaNotificationSchema, TimelineEntryNotificationSchema, TimelineWindowResultSchema } from "./timeline";
import {
	WorkspaceTargetListParamsSchema,
	WorkspaceTargetListResultSchema,
	WorkspaceTargetValidateParamsSchema,
	WorkspaceTargetValidateResultSchema,
} from "./workspace-target";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const protocolV1Version = "1.0.0" as const;
export const ProtocolV1VersionSchema = Type.Literal(protocolV1Version);
export type ProtocolV1Version = Static<typeof ProtocolV1VersionSchema>;

export const ProtocolV1EmptyParamsSchema = StrictObject({});
export type ProtocolV1EmptyParams = Static<typeof ProtocolV1EmptyParamsSchema>;

export const ProtocolV1EmptyResultSchema = StrictObject({});
export type ProtocolV1EmptyResult = Static<typeof ProtocolV1EmptyResultSchema>;

const request = <Method extends string, Params extends TSchema>(method: Method, params: Params) =>
	StrictObject({
		kind: Type.Literal("request"),
		id: RequestIdSchema,
		method: Type.Literal(method),
		params,
	});

const notification = <Method extends string, Params extends TSchema>(method: Method, params: Params) =>
	StrictObject({
		kind: Type.Literal("notification"),
		method: Type.Literal(method),
		params,
	});

export const ProtocolV1InitializeParamsSchema = StrictObject({
	protocolVersion: ProtocolV1VersionSchema,
	client: StrictObject({ name: Type.String({ minLength: 1 }), version: Type.Optional(Type.String()) }),
});
export type ProtocolV1InitializeParams = Static<typeof ProtocolV1InitializeParamsSchema>;

export const ProtocolV1InitializeResultSchema = StrictObject({
	protocolVersion: ProtocolV1VersionSchema,
	server: StrictObject({ name: Type.String({ minLength: 1 }), version: Type.String({ minLength: 1 }) }),
	capabilities: Type.Record(Type.String(), Type.Boolean()),
});
export type ProtocolV1InitializeResult = Static<typeof ProtocolV1InitializeResultSchema>;

export const ProtocolV1ClientRequestSchema = Type.Union([
	request("initialize", ProtocolV1InitializeParamsSchema),
	request("provider.snapshot", ProviderSnapshotParamsSchema),
	request("workspaceTarget.list", WorkspaceTargetListParamsSchema),
	request("workspaceTarget.validate", WorkspaceTargetValidateParamsSchema),
	request("thread.create", ThreadCreateParamsSchema),
	request("thread.list", ThreadListParamsSchema),
	request("thread.resume", ThreadResumeParamsSchema),
	request("thread.get", ThreadGetParamsSchema),
	request("thread.replay", ThreadReplayParamsSchema),
	request("thread.rollback", ThreadRollbackParamsSchema),
	request("turn.start", TurnStartParamsSchema),
	request("turn.cancel", TurnCancelParamsSchema),
	request("payload.window", PayloadWindowParamsSchema),
	request("text.threadTitle", TextGenerateThreadTitleParamsSchema),
	request("text.branchName", TextGenerateBranchNameParamsSchema),
	request("text.commitMessage", TextGenerateCommitMessageParamsSchema),
	request("text.prContent", TextGeneratePrContentParamsSchema),
]);
export type ProtocolV1ClientRequest = Static<typeof ProtocolV1ClientRequestSchema>;

export const ProtocolV1ClientRequestResultSchemas = {
	initialize: ProtocolV1InitializeResultSchema,
	"provider.snapshot": ProviderSnapshotResultSchema,
	"workspaceTarget.list": WorkspaceTargetListResultSchema,
	"workspaceTarget.validate": WorkspaceTargetValidateResultSchema,
	"thread.create": ThreadCreateResultSchema,
	"thread.list": ThreadListResultSchema,
	"thread.resume": ThreadResumeResultSchema,
	"thread.get": ThreadGetResultSchema,
	"thread.replay": TimelineWindowResultSchema,
	"thread.rollback": ThreadRollbackResultSchema,
	"turn.start": TurnStartResultSchema,
	"turn.cancel": TurnCancelResultSchema,
	"payload.window": PayloadWindowResultSchema,
	"text.threadTitle": TextGenerateThreadTitleResultSchema,
	"text.branchName": TextGenerateBranchNameResultSchema,
	"text.commitMessage": TextGenerateCommitMessageResultSchema,
	"text.prContent": TextGeneratePrContentResultSchema,
} as const;

export type ProtocolV1ClientRequestResultMap = {
	[Method in keyof typeof ProtocolV1ClientRequestResultSchemas]: Static<
		(typeof ProtocolV1ClientRequestResultSchemas)[Method]
	>;
};
export type ProtocolV1ClientRequestResult<Method extends ProtocolV1ClientRequest["method"]> =
	Method extends keyof ProtocolV1ClientRequestResultMap ? ProtocolV1ClientRequestResultMap[Method] : unknown;

export function protocolV1ResultSchemaForMethod(method: ProtocolV1ClientRequest["method"]): TSchema | undefined {
	return ProtocolV1ClientRequestResultSchemas[method as keyof typeof ProtocolV1ClientRequestResultSchemas];
}

export const ProtocolV1AppServerErrorCodeSchema = Type.Union([
	Type.Literal("parse_error"),
	Type.Literal("invalid_request"),
	Type.Literal("not_initialized"),
	Type.Literal("method_not_found"),
	Type.Literal("invalid_params"),
	Type.Literal("conflict"),
	Type.Literal("cancelled"),
	Type.Literal("unsupported_capability"),
	Type.Literal("internal_error"),
]);
export type ProtocolV1AppServerErrorCode = Static<typeof ProtocolV1AppServerErrorCodeSchema>;

export const ProtocolV1ResponseErrorSchema = StrictObject({
	code: ProtocolV1AppServerErrorCodeSchema,
	message: Type.String(),
	data: Type.Optional(Type.Unknown()),
});
export type ProtocolV1ResponseError = Static<typeof ProtocolV1ResponseErrorSchema>;

export const ProtocolV1ServerResponseSchema = Type.Union([
	StrictObject({
		kind: Type.Literal("response"),
		id: RequestIdSchema,
		ok: Type.Literal(true),
		result: Type.Unknown(),
	}),
	StrictObject({
		kind: Type.Literal("response"),
		id: RequestIdSchema,
		ok: Type.Literal(false),
		error: ProtocolV1ResponseErrorSchema,
	}),
]);
export type ProtocolV1ServerResponse = Static<typeof ProtocolV1ServerResponseSchema>;

export const ProtocolV1ServerNotificationSchema = Type.Union([
	notification("workspaceTarget.changed", StrictObject({ workspaceTargetId: WorkspaceTargetIdSchema })),
	notification(
		"thread.changed",
		StrictObject({ threadId: ThreadIdSchema, status: Type.Optional(ThreadStatusSchema) }),
	),
	notification(
		"turn.changed",
		StrictObject({ threadId: ThreadIdSchema, turnId: TurnIdSchema, status: Type.Optional(TurnStatusSchema) }),
	),
	notification("thread.timeline", TimelineEntryNotificationSchema),
	notification("thread.timeline.delta", TimelineDeltaNotificationSchema),
]);
export type ProtocolV1ServerNotification = Static<typeof ProtocolV1ServerNotificationSchema>;

export const ProtocolV1ClientNotificationSchema = Type.Union([
	notification("thread.closed", StrictObject({ threadId: ThreadIdSchema })),
]);
export type ProtocolV1ClientNotification = Static<typeof ProtocolV1ClientNotificationSchema>;
