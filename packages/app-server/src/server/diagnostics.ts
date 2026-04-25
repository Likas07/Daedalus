import type { DiagnosticExport, DiagnosticExportParams } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../persistence/database";
import { readRecentEvents } from "../persistence/event-store";

export function createDiagnosticExport(
	database: AppServerDatabase,
	params: DiagnosticExportParams = {},
): DiagnosticExport {
	const limit = params.recentEventLimit ?? 50;
	const recentEvents = readRecentEvents(database, { limit });
	return {
		exportedAt: new Date().toISOString(),
		transcript: params.includeTranscripts === false ? [] : recentEvents.map((event) => event.payload),
		toolLogs: params.includeToolLogs === false ? [] : recentEvents.filter((event) => event.type.includes("tool")),
		appServerLogs: [],
		environment: {
			platform: process.platform,
			arch: process.arch,
			bunVersion: typeof Bun !== "undefined" ? Bun.version : undefined,
			nodeVersion: process.version,
			cwd: process.cwd(),
		},
		versions: { appServer: "0.1.0", protocol: "0.1.0" },
		integrationStatus: recentEvents
			.filter((event) => event.type === "integration/state")
			.map((event) => event.payload),
		recentProtocolEvents: recentEvents.map((event) => ({
			seq: event.seq,
			type: event.type,
			streamId: event.streamId,
			createdAt: event.createdAt,
		})),
	};
}
