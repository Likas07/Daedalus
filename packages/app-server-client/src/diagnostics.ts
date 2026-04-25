import type { DiagnosticExportParams, DiagnosticExportResult } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "./client";

export async function exportDiagnostics(
	client: AppServerClient,
	params: DiagnosticExportParams = {},
): Promise<DiagnosticExportResult> {
	return client.request("diagnostics/export" as never, params as never) as Promise<DiagnosticExportResult>;
}
