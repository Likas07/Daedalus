import type { DesktopBootDiagnostic } from "@daedalus-pi/app-server-protocol";

export type BootDiagnosticStageStatus = "ok" | "failed" | "pending";

export interface BootDiagnosticStage {
	readonly name: string;
	readonly status: BootDiagnosticStageStatus;
	readonly message?: string;
	readonly at: string;
	readonly durationMs?: number;
}

export type AppServerBootDiagnostics = DesktopBootDiagnostic & {
	readonly stages: readonly BootDiagnosticStage[];
	readonly manifestReused?: boolean;
	readonly pidHealthy?: boolean;
	readonly tokenFilePath?: string;
	readonly dbPath?: string;
	readonly runtime?: { readonly kind: string; readonly command: string; readonly args: readonly string[] };
	readonly spawnCommand?: readonly string[];
	readonly readinessJson?: unknown;
	readonly stdoutExcerpt?: string;
	readonly stderrExcerpt?: string;
	readonly exitCode?: number | null;
	readonly timedOut?: boolean;
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type MutableBootDiagnostics = Mutable<Omit<AppServerBootDiagnostics, "stages">> & { stages: BootDiagnosticStage[] };

const REDACTED = "<redacted>";
const MAX_EXCERPT_CHARS = 4_000;

export function createBootDiagnostics(message = "Starting desktop app server"): MutableBootDiagnostics {
	return {
		stage: "starting",
		ready: false,
		message,
		updatedAt: new Date().toISOString(),
		stages: [],
	};
}

export function recordBootStage(
	diagnostics: MutableBootDiagnostics,
	name: string,
	status: BootDiagnosticStageStatus,
	message?: string,
	startedAt?: number,
): void {
	diagnostics.stages.push({
		name,
		status,
		message,
		at: new Date().toISOString(),
		durationMs: startedAt === undefined ? undefined : Math.max(0, Date.now() - startedAt),
	});
	diagnostics.stage =
		status === "failed" ? "failed" : name === "readiness-json" ? "app-server-ready" : diagnostics.stage;
	diagnostics.updatedAt = new Date().toISOString();
	if (message) diagnostics.message = message;
}

export function finalizeBootDiagnostics(
	diagnostics: MutableBootDiagnostics,
	input: { ready: boolean; message?: string; error?: string; durationMs?: number },
): AppServerBootDiagnostics {
	diagnostics.ready = input.ready;
	diagnostics.stage = input.ready ? "ready" : "failed";
	diagnostics.updatedAt = new Date().toISOString();
	diagnostics.message = input.message ?? diagnostics.message;
	diagnostics.error = input.error;
	diagnostics.durationMs = input.durationMs;
	return diagnostics;
}

export function redactPath(path: string): string {
	return path.replace(/[^/\\]+$/, REDACTED);
}

export function redactCommand(
	command: string,
	args: readonly string[],
	sensitivePaths: readonly string[] = [],
): readonly string[] {
	const sensitive = new Map(sensitivePaths.map((path) => [path, redactPath(path)]));
	return [command, ...args].map((part) => sensitive.get(part) ?? part);
}

export function appendExcerpt(previous: string | undefined, chunk: string, maxChars = MAX_EXCERPT_CHARS): string {
	const next = `${previous ?? ""}${chunk}`;
	return next.length <= maxChars ? next : next.slice(next.length - maxChars);
}

export function attachBootDiagnostics<T extends Error>(
	error: T,
	diagnostics: AppServerBootDiagnostics,
): T & { bootDiagnostics: AppServerBootDiagnostics } {
	Object.defineProperty(error, "bootDiagnostics", { value: diagnostics, enumerable: true });
	return error as T & { bootDiagnostics: AppServerBootDiagnostics };
}
