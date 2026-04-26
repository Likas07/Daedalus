import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { SessionIdSchema } from "./ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const RuntimeQueueModeSchema = Type.Union([Type.Literal("all"), Type.Literal("one-at-a-time")]);
export type RuntimeQueueMode = Static<typeof RuntimeQueueModeSchema>;

export const RuntimeModelSchema = Type.Object({
	provider: Type.String({ minLength: 1 }),
	id: Type.String({ minLength: 1 }),
	name: Type.Optional(Type.String()),
});
export type RuntimeModel = Static<typeof RuntimeModelSchema>;

export const RuntimeStateParamsSchema = Type.Object({ sessionId: SessionIdSchema });
export type RuntimeStateParams = Static<typeof RuntimeStateParamsSchema>;

export const RuntimeSetModelParamsSchema = Type.Object({
	sessionId: SessionIdSchema,
	provider: Type.String({ minLength: 1 }),
	modelId: Type.String({ minLength: 1 }),
});
export type RuntimeSetModelParams = Static<typeof RuntimeSetModelParamsSchema>;

export const RuntimeCycleModelParamsSchema = Type.Object({ sessionId: SessionIdSchema });
export type RuntimeCycleModelParams = Static<typeof RuntimeCycleModelParamsSchema>;

export const RuntimeSetThinkingParamsSchema = Type.Object({
	sessionId: SessionIdSchema,
	level: Type.String({ minLength: 1 }),
});
export type RuntimeSetThinkingParams = Static<typeof RuntimeSetThinkingParamsSchema>;

export const RuntimeCycleThinkingParamsSchema = Type.Object({ sessionId: SessionIdSchema });
export type RuntimeCycleThinkingParams = Static<typeof RuntimeCycleThinkingParamsSchema>;

export const RuntimeSetToolsParamsSchema = Type.Object({
	sessionId: SessionIdSchema,
	tools: Type.Array(Type.String({ minLength: 1 })),
});
export type RuntimeSetToolsParams = Static<typeof RuntimeSetToolsParamsSchema>;

export const RuntimeSetQueueModeParamsSchema = Type.Object({
	sessionId: SessionIdSchema,
	mode: RuntimeQueueModeSchema,
});
export type RuntimeSetQueueModeParams = Static<typeof RuntimeSetQueueModeParamsSchema>;

export const RuntimeCompactParamsSchema = Type.Object({
	sessionId: SessionIdSchema,
	customInstructions: Type.Optional(Type.String()),
});
export type RuntimeCompactParams = Static<typeof RuntimeCompactParamsSchema>;

export const RuntimeAbortParamsSchema = Type.Object({ sessionId: SessionIdSchema });
export type RuntimeAbortParams = Static<typeof RuntimeAbortParamsSchema>;

export const RuntimeReloadResourcesParamsSchema = Type.Object({ sessionId: SessionIdSchema });
export type RuntimeReloadResourcesParams = Static<typeof RuntimeReloadResourcesParamsSchema>;

export const RuntimeCommandsParamsSchema = Type.Object({ sessionId: SessionIdSchema });
export type RuntimeCommandsParams = Static<typeof RuntimeCommandsParamsSchema>;

export const RuntimeKeybindingsParamsSchema = Type.Object({ sessionId: Type.Optional(SessionIdSchema) });
export type RuntimeKeybindingsParams = Static<typeof RuntimeKeybindingsParamsSchema>;

export const RuntimeStateSchema = Type.Object({
	model: Type.Optional(Type.Unknown()),
	thinkingLevel: Type.Optional(Type.String()),
	isStreaming: Type.Boolean(),
	isCompacting: Type.Boolean(),
	steeringMode: RuntimeQueueModeSchema,
	followUpMode: RuntimeQueueModeSchema,
	sessionFile: Type.Optional(Type.String()),
	sessionId: Type.Optional(Type.String()),
	sessionName: Type.Optional(Type.String()),
	autoCompactionEnabled: Type.Optional(Type.Boolean()),
	messageCount: Type.Integer({ minimum: 0 }),
	pendingMessageCount: Type.Integer({ minimum: 0 }),
});
export type RuntimeState = Static<typeof RuntimeStateSchema>;

export const RuntimeCommandSchema = Type.Object({
	name: Type.String({ minLength: 1 }),
	description: Type.Optional(Type.String()),
	source: Type.Union([Type.Literal("extension"), Type.Literal("prompt"), Type.Literal("skill")]),
	sourceInfo: Type.Optional(Type.Unknown()),
});
export type RuntimeCommand = Static<typeof RuntimeCommandSchema>;

export const RuntimeKeybindingSchema = Type.Object({
	action: Type.String({ minLength: 1 }),
	keys: Type.Array(Type.String()),
});
export type RuntimeKeybinding = Static<typeof RuntimeKeybindingSchema>;

export const RuntimeSetModelResultSchema = StrictObject({ model: Type.Unknown() });
export const RuntimeCycleModelResultSchema = StrictObject({ result: Type.Unknown() });
export const RuntimeSetThinkingResultSchema = StrictObject({ level: Type.String() });
export const RuntimeCycleThinkingResultSchema = StrictObject({ level: Type.Union([Type.String(), Type.Null()]) });
export const RuntimeSetToolsResultSchema = StrictObject({ tools: Type.Array(Type.String({ minLength: 1 })) });
export const RuntimeSetQueueModeResultSchema = StrictObject({ mode: RuntimeQueueModeSchema });
export const RuntimeCompactResultSchema = StrictObject({ result: Type.Unknown() });
export const RuntimeAbortResultSchema = StrictObject({});
export const RuntimeReloadResourcesResultSchema = StrictObject({ diagnostics: Type.Array(Type.Unknown()) });
export const RuntimeCommandsResultSchema = StrictObject({ commands: Type.Array(RuntimeCommandSchema) });
export const RuntimeKeybindingsResultSchema = StrictObject({ keybindings: Type.Array(RuntimeKeybindingSchema) });

export const RuntimeControlResultSchemas = {
	"runtime/get-state": RuntimeStateSchema,
	"runtime/set-model": RuntimeSetModelResultSchema,
	"runtime/cycle-model": RuntimeCycleModelResultSchema,
	"runtime/set-thinking": RuntimeSetThinkingResultSchema,
	"runtime/cycle-thinking": RuntimeCycleThinkingResultSchema,
	"runtime/set-tools": RuntimeSetToolsResultSchema,
	"runtime/set-steering-mode": RuntimeSetQueueModeResultSchema,
	"runtime/set-follow-up-mode": RuntimeSetQueueModeResultSchema,
	"runtime/compact": RuntimeCompactResultSchema,
	"runtime/abort": RuntimeAbortResultSchema,
	"runtime/reload-resources": RuntimeReloadResourcesResultSchema,
	"runtime/get-commands": RuntimeCommandsResultSchema,
	"runtime/get-keybindings": RuntimeKeybindingsResultSchema,
} as const;

export interface RuntimeControlResultMap {
	"runtime/get-state": RuntimeState;
	"runtime/set-model": { model: unknown };
	"runtime/cycle-model": { result: unknown };
	"runtime/set-thinking": { level: string };
	"runtime/cycle-thinking": { level: string | null };
	"runtime/set-tools": { tools: readonly string[] };
	"runtime/set-steering-mode": { mode: RuntimeQueueMode };
	"runtime/set-follow-up-mode": { mode: RuntimeQueueMode };
	"runtime/compact": { result: unknown };
	"runtime/abort": Record<string, never>;
	"runtime/reload-resources": { diagnostics: readonly unknown[] };
	"runtime/get-commands": { commands: readonly RuntimeCommand[] };
	"runtime/get-keybindings": { keybindings: readonly RuntimeKeybinding[] };
}
