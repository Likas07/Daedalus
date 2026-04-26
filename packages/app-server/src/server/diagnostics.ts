import type { DiagnosticExport, DiagnosticExportParams } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../persistence/database";
import { ExportService } from "./export-service";

export async function createDiagnosticExport(
	database: AppServerDatabase,
	params: DiagnosticExportParams = {},
): Promise<DiagnosticExport> {
	return (await new ExportService({ database }).export(params)).export;
}
