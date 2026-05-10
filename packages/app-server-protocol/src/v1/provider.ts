import { type Static, type TSchema, Type } from "@sinclair/typebox";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const ProviderCapabilityMapSchema = StrictObject({
	streamingChat: Type.Boolean(),
	cancellation: Type.Boolean(),
	approvals: Type.Boolean(),
	structuredUserInput: Type.Boolean(),
	toolTimeline: Type.Boolean(),
	payloadWindows: Type.Boolean(),
	diffs: Type.Boolean(),
	checkpoints: Type.Boolean(),
	rollback: Type.Boolean(),
	resume: Type.Boolean(),
	modelSwitching: Type.Boolean(),
	textGeneration: Type.Boolean(),
	imageAttachments: Type.Boolean(),
	terminals: Type.Boolean(),
});
export type ProviderCapabilityMap = Static<typeof ProviderCapabilityMapSchema>;

export const ProviderHealthStatusSchema = Type.Union([
	Type.Literal("starting"),
	Type.Literal("ready"),
	Type.Literal("degraded"),
	Type.Literal("auth-needed"),
	Type.Literal("failed"),
]);

export const ProviderModelSummarySchema = StrictObject({
	slug: Type.String({ minLength: 1 }),
	provider: Type.String({ minLength: 1 }),
	id: Type.String({ minLength: 1 }),
	name: Type.String({ minLength: 1 }),
	available: Type.Boolean(),
	reasoning: Type.Optional(Type.Boolean()),
	fastMode: Type.Optional(Type.Boolean()),
	reasoningLevels: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
});

export const ProviderAuthSummarySchema = StrictObject({
	provider: Type.String({ minLength: 1 }),
	status: Type.Union([Type.Literal("authenticated"), Type.Literal("unauthenticated"), Type.Literal("unknown")]),
	message: Type.Optional(Type.String()),
});

export const ProviderCommandSummarySchema = StrictObject({
	name: Type.String({ minLength: 1 }),
	description: Type.Optional(Type.String()),
	source: Type.Optional(Type.String()),
});

export const ProviderSnapshotParamsSchema = StrictObject({});
export const ProviderSnapshotResultSchema = StrictObject({
	status: ProviderHealthStatusSchema,
	server: StrictObject({ name: Type.String(), version: Type.String(), protocolVersion: Type.String() }),
	capabilities: ProviderCapabilityMapSchema,
	models: Type.Array(ProviderModelSummarySchema),
	auth: Type.Array(ProviderAuthSummarySchema),
	commands: Type.Array(ProviderCommandSummarySchema),
	message: Type.Optional(Type.String()),
});
export type ProviderSnapshotResult = Static<typeof ProviderSnapshotResultSchema>;
