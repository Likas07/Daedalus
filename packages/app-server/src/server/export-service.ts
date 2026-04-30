import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	DiagnosticExport,
	DiagnosticExportKind,
	DiagnosticExportParams,
	RestorationTrace,
} from "@daedalus-pi/app-server-protocol";
import type { SessionStoreSession } from "@daedalus-pi/coding-agent";

import type { AppServerDatabase } from "../persistence/database";
import { readRecentEvents, type StoredEvent } from "../persistence/event-store";
import { SqliteSessionStore } from "../sessions/sqlite-session-store";

export interface ExportServiceOptions {
	readonly database: AppServerDatabase;
	readonly outputDir?: string;
	readonly runtimeDiagnostics?: () => unknown;
	readonly restorationTrace?: () => RestorationTrace | undefined;
}
export interface ExportServiceResult {
	readonly export: DiagnosticExport;
	readonly content: string;
	readonly filename: string;
	readonly path?: string;
}

const SECRET_PATTERNS: readonly [RegExp, string][] = [
	[/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
	[/(api[_-]?key["'\s:=]+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]"],
	[/(oauth[_-]?token["'\s:=]+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]"],
	[/(authorization["'\s:=]+)(?:Bearer\s+)?[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]"],
];

export function redactSecrets<T>(value: T): T {
	if (typeof value === "string") {
		let text: string = value;
		for (const [pattern, replacement] of SECRET_PATTERNS) text = text.replace(pattern, replacement);
		return text as T;
	}
	if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, inner] of Object.entries(value)) {
			out[key] = /^(authorization|x-api-key|api-key|access_token|refresh_token|oauth_token)$/i.test(key)
				? "[REDACTED]"
				: redactSecrets(inner);
		}
		return out as T;
	}
	return value;
}

function htmlEscape(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function sessionToHtml(session: SessionStoreSession): string {
	return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(session.header.id)}</title></head><body><h1>Daedalus session ${htmlEscape(session.header.id)}</h1><pre>${htmlEscape(JSON.stringify(redactSecrets(session), null, 2))}</pre></body></html>`;
}

export class ExportService {
	private readonly sessionStore: SqliteSessionStore;
	constructor(private readonly options: ExportServiceOptions) {
		this.sessionStore = new SqliteSessionStore({ database: options.database });
	}

	async export(params: DiagnosticExportParams = {}): Promise<ExportServiceResult> {
		const kind = params.kind ?? "support-bundle";
		const diagnostic = await this.buildDiagnostic(params, kind);
		const { content, filename } = await this.buildContent(kind, params, diagnostic);
		const redacted =
			typeof content === "string" ? redactSecrets(content) : JSON.stringify(redactSecrets(content), null, 2);
		const path = this.options.outputDir ? join(this.options.outputDir, filename) : undefined;
		if (path) {
			await mkdir(this.options.outputDir!, { recursive: true });
			await writeFile(path, redacted);
		}
		return { export: diagnostic, content: redacted, filename, path };
	}

	private async buildDiagnostic(
		params: DiagnosticExportParams,
		kind: DiagnosticExportKind,
	): Promise<DiagnosticExport> {
		const limit = params.recentEventLimit ?? 50;
		const events = readRecentEvents(this.options.database, { limit, streamId: params.sessionId });
		const allEvents =
			events.length > 0 || params.sessionId ? events : readRecentEvents(this.options.database, { limit });
		return redactSecrets({
			exportedAt: new Date().toISOString(),
			kind,
			sessionId: params.sessionId,
			transcript: params.includeTranscripts === false ? [] : allEvents.map((event) => event.payload),
			toolLogs: params.includeToolLogs === false ? [] : allEvents.filter((event) => event.type.includes("tool")),
			appServerLogs: [],
			runtimeDiagnostics: this.options.runtimeDiagnostics?.(),
			restorationTrace: this.options.restorationTrace?.(),
			environment: {
				platform: process.platform,
				arch: process.arch,
				bunVersion: typeof Bun !== "undefined" ? Bun.version : undefined,
				nodeVersion: process.version,
				cwd: process.cwd(),
			},
			versions: { appServer: "0.1.0", protocol: "0.1.0" },
			integrationStatus: allEvents
				.filter((event) => event.type === "integration/state")
				.map((event) => event.payload),
			recentProtocolEvents: allEvents.map((event: StoredEvent) => ({
				seq: event.seq,
				type: event.type,
				streamId: event.streamId,
				createdAt: event.createdAt,
			})),
		});
	}

	private async buildContent(
		kind: DiagnosticExportKind,
		params: DiagnosticExportParams,
		diagnostic: DiagnosticExport,
	): Promise<{ content: string; filename: string }> {
		if (kind === "jsonl-session") {
			if (!params.sessionId) throw new Error("sessionId is required for JSONL export");
			return {
				content: await this.sessionStore.exportJsonl({ sessionId: params.sessionId }),
				filename: `${params.sessionId}.jsonl`,
			};
		}
		if (kind === "html-session") {
			if (!params.sessionId) throw new Error("sessionId is required for HTML export");
			return {
				content: sessionToHtml(await this.sessionStore.export({ sessionId: params.sessionId })),
				filename: `${params.sessionId}.html`,
			};
		}
		if (kind === "sqlite-session-bundle") {
			if (!params.sessionId) throw new Error("sessionId is required for SQLite session bundle");
			const session = await this.sessionStore.export({ sessionId: params.sessionId });
			return {
				content: JSON.stringify(
					{ format: "daedalus-sqlite-session-bundle", session, diagnostics: diagnostic },
					null,
					2,
				),
				filename: `${params.sessionId}.sqlite-bundle.json`,
			};
		}
		return {
			content: JSON.stringify(diagnostic, null, 2),
			filename: `daedalus-support-${new Date().toISOString().replaceAll(":", "-")}.json`,
		};
	}
}
