export interface DiagnosticVersionInfo {
	readonly appServer?: string;
	readonly gui?: string;
	readonly desktop?: string;
	readonly protocol?: string;
}

export interface DiagnosticEnvironmentSummary {
	readonly platform: string;
	readonly arch: string;
	readonly bunVersion?: string;
	readonly nodeVersion?: string;
	readonly cwd?: string;
}

export interface DiagnosticProtocolEvent {
	readonly seq?: number;
	readonly type: string;
	readonly streamId?: string;
	readonly createdAt?: string;
}

export type DiagnosticExportKind = "support-bundle" | "sqlite-session-bundle" | "jsonl-session" | "html-session";

export interface DiagnosticExport {
	readonly exportedAt: string;
	readonly kind?: DiagnosticExportKind;
	readonly sessionId?: string;
	readonly transcript: readonly unknown[];
	readonly toolLogs: readonly unknown[];
	readonly appServerLogs: readonly string[];
	readonly runtimeDiagnostics?: unknown;
	readonly environment: DiagnosticEnvironmentSummary;
	readonly versions: DiagnosticVersionInfo;
	readonly integrationStatus: readonly unknown[];
	readonly recentProtocolEvents: readonly DiagnosticProtocolEvent[];
}

export interface DiagnosticExportParams {
	readonly kind?: DiagnosticExportKind;
	readonly sessionId?: string;
	readonly includeTranscripts?: boolean;
	readonly includeToolLogs?: boolean;
	readonly recentEventLimit?: number;
}

export interface DiagnosticExportResult {
	readonly export: DiagnosticExport;
	readonly content?: string;
	readonly filename?: string;
	readonly path?: string;
}
