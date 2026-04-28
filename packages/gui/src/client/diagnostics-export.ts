import type { DesktopBootDiagnostic, DiagnosticExport } from "@daedalus-pi/app-server-protocol";

export interface BootReadinessRow {
	readonly label: string;
	readonly value: string;
}

export function withDesktopBootDiagnostics(
	diagnostics: DiagnosticExport,
	desktopBoot?: DesktopBootDiagnostic,
): DiagnosticExport {
	return desktopBoot ? { ...diagnostics, desktopBoot } : diagnostics;
}

export function bootReadinessRows(desktopBoot?: DesktopBootDiagnostic): readonly BootReadinessRow[] {
	if (!desktopBoot) return [];
	const detail = desktopBoot as DesktopBootDiagnostic & {
		manifestReused?: boolean;
		pidHealthy?: boolean;
		tokenFilePath?: string;
		dbPath?: string;
		spawnCommand?: readonly string[];
		readinessJson?: unknown;
		stdoutExcerpt?: string;
		stderrExcerpt?: string;
		exitCode?: number | null;
		timedOut?: boolean;
	};
	const rows: BootReadinessRow[] = [
		{ label: "boot stage", value: `${desktopBoot.stage}${desktopBoot.ready ? " (ready)" : ""}` },
		{ label: "updated", value: desktopBoot.updatedAt },
	];
	if (typeof detail.manifestReused === "boolean")
		rows.push({ label: "manifest reuse", value: String(detail.manifestReused) });
	if (typeof detail.pidHealthy === "boolean") rows.push({ label: "pid health", value: String(detail.pidHealthy) });
	if (detail.tokenFilePath) rows.push({ label: "token file", value: detail.tokenFilePath });
	if (detail.dbPath) rows.push({ label: "database", value: detail.dbPath });
	if (detail.spawnCommand?.length) rows.push({ label: "spawn command", value: detail.spawnCommand.join(" ") });
	if (detail.readinessJson) rows.push({ label: "readiness", value: JSON.stringify(detail.readinessJson) });
	if (detail.stdoutExcerpt) rows.push({ label: "stdout", value: detail.stdoutExcerpt });
	if (detail.stderrExcerpt) rows.push({ label: "stderr", value: detail.stderrExcerpt });
	if (detail.exitCode !== undefined) rows.push({ label: "exit code", value: String(detail.exitCode) });
	if (detail.timedOut) rows.push({ label: "timeout", value: "true" });
	if (desktopBoot.error) rows.push({ label: "error", value: desktopBoot.error });
	return rows;
}
