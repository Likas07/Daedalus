import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { ProjectIdSchema, SessionIdSchema } from "./ids";

const StrictObject = <Properties extends Record<string, TSchema>>(properties: Properties) =>
	Type.Object(properties, { additionalProperties: false });

export const DiagnosticVersionInfoSchema = StrictObject({
	appServer: Type.Optional(Type.String()),
	gui: Type.Optional(Type.String()),
	desktop: Type.Optional(Type.String()),
	protocol: Type.Optional(Type.String()),
});
export type DiagnosticVersionInfo = Static<typeof DiagnosticVersionInfoSchema>;

export const DiagnosticEnvironmentSummarySchema = StrictObject({
	platform: Type.String({ minLength: 1 }),
	arch: Type.String({ minLength: 1 }),
	bunVersion: Type.Optional(Type.String()),
	nodeVersion: Type.Optional(Type.String()),
	cwd: Type.Optional(Type.String()),
});
export type DiagnosticEnvironmentSummary = Static<typeof DiagnosticEnvironmentSummarySchema>;

export const DiagnosticProtocolEventSchema = StrictObject({
	seq: Type.Optional(Type.Integer({ minimum: 0 })),
	type: Type.String({ minLength: 1 }),
	streamId: Type.Optional(Type.String()),
	createdAt: Type.Optional(Type.String()),
});
export type DiagnosticProtocolEvent = Static<typeof DiagnosticProtocolEventSchema>;

export const DiagnosticExportKindSchema = Type.Union([
	Type.Literal("support-bundle"),
	Type.Literal("sqlite-session-bundle"),
	Type.Literal("jsonl-session"),
	Type.Literal("html-session"),
]);
export type DiagnosticExportKind = Static<typeof DiagnosticExportKindSchema>;

export const DesktopBootReadinessStageSchema = Type.Union([
	Type.Literal("starting"),
	Type.Literal("protocol-loading"),
	Type.Literal("manifest-reuse"),
	Type.Literal("pid-health"),
	Type.Literal("token-file"),
	Type.Literal("db-path"),
	Type.Literal("runtime-resolution"),
	Type.Literal("app-server-spawning"),
	Type.Literal("spawn-command"),
	Type.Literal("readiness-json"),
	Type.Literal("app-server-ready"),
	Type.Literal("stdout"),
	Type.Literal("stderr"),
	Type.Literal("exit"),
	Type.Literal("timeout"),
	Type.Literal("gui-loading"),
	Type.Literal("ready"),
	Type.Literal("failed"),
]);
export type DesktopBootReadinessStage = Static<typeof DesktopBootReadinessStageSchema>;

export const DesktopBootDiagnosticStageSchema = StrictObject({
	name: Type.String({ minLength: 1 }),
	status: Type.Union([Type.Literal("ok"), Type.Literal("failed"), Type.Literal("pending")]),
	message: Type.Optional(Type.String({ minLength: 1 })),
	at: Type.String({ minLength: 1 }),
	durationMs: Type.Optional(Type.Integer({ minimum: 0 })),
});
export type DesktopBootDiagnosticStage = Static<typeof DesktopBootDiagnosticStageSchema>;

export const DesktopBootDiagnosticSchema = StrictObject({
	stage: DesktopBootReadinessStageSchema,
	ready: Type.Boolean(),
	message: Type.Optional(Type.String({ minLength: 1 })),
	updatedAt: Type.String({ minLength: 1 }),
	durationMs: Type.Optional(Type.Integer({ minimum: 0 })),
	error: Type.Optional(Type.String({ minLength: 1 })),
	stages: Type.Optional(Type.Array(DesktopBootDiagnosticStageSchema)),
	manifestReused: Type.Optional(Type.Boolean()),
	pidHealthy: Type.Optional(Type.Boolean()),
	tokenFilePath: Type.Optional(Type.String({ minLength: 1 })),
	dbPath: Type.Optional(Type.String({ minLength: 1 })),
	runtime: Type.Optional(Type.Unknown()),
	spawnCommand: Type.Optional(Type.Array(Type.String())),
	readinessJson: Type.Optional(Type.Unknown()),
	stdoutExcerpt: Type.Optional(Type.String()),
	stderrExcerpt: Type.Optional(Type.String()),
	exitCode: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
	timedOut: Type.Optional(Type.Boolean()),
});
export type DesktopBootDiagnostic = Static<typeof DesktopBootDiagnosticSchema>;

export const RestorationTraceStatusSchema = Type.Union([
	Type.Literal("restored"),
	Type.Literal("missing"),
	Type.Literal("mismatched"),
	Type.Literal("degraded"),
	Type.Literal("failed"),
]);
export type RestorationTraceStatus = Static<typeof RestorationTraceStatusSchema>;

export const RestorationTraceSchema = StrictObject({
	projectId: ProjectIdSchema,
	requestedSelection: Type.Optional(Type.Unknown()),
	resolvedSession: Type.Optional(SessionIdSchema),
	status: RestorationTraceStatusSchema,
	reason: Type.Optional(Type.String({ minLength: 1 })),
	checkedAt: Type.String({ minLength: 1 }),
});
export type RestorationTrace = Static<typeof RestorationTraceSchema>;

export const DiagnosticExportSchema = StrictObject({
	exportedAt: Type.String({ minLength: 1 }),
	kind: Type.Optional(DiagnosticExportKindSchema),
	sessionId: Type.Optional(SessionIdSchema),
	transcript: Type.Array(Type.Unknown()),
	toolLogs: Type.Array(Type.Unknown()),
	appServerLogs: Type.Array(Type.String()),
	runtimeDiagnostics: Type.Optional(Type.Unknown()),
	environment: DiagnosticEnvironmentSummarySchema,
	versions: DiagnosticVersionInfoSchema,
	integrationStatus: Type.Array(Type.Unknown()),
	recentProtocolEvents: Type.Array(DiagnosticProtocolEventSchema),
	desktopBoot: Type.Optional(DesktopBootDiagnosticSchema),
	restorationTrace: Type.Optional(RestorationTraceSchema),
});
export type DiagnosticExport = Static<typeof DiagnosticExportSchema>;

export const DiagnosticExportParamsSchema = StrictObject({
	kind: Type.Optional(DiagnosticExportKindSchema),
	sessionId: Type.Optional(SessionIdSchema),
	includeTranscripts: Type.Optional(Type.Boolean()),
	includeToolLogs: Type.Optional(Type.Boolean()),
	recentEventLimit: Type.Optional(Type.Integer({ minimum: 1 })),
});
export type DiagnosticExportParams = Static<typeof DiagnosticExportParamsSchema>;

export const DiagnosticExportResultSchema = StrictObject({
	export: DiagnosticExportSchema,
	content: Type.Optional(Type.String()),
	filename: Type.Optional(Type.String()),
	path: Type.Optional(Type.String()),
});
export type DiagnosticExportResult = Static<typeof DiagnosticExportResultSchema>;
