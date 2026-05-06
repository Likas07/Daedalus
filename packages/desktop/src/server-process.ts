import { type ChildProcess, type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type AppServerBootDiagnostics,
	appendExcerpt,
	attachBootDiagnostics,
	createBootDiagnostics,
	finalizeBootDiagnostics,
	recordBootStage,
	redactCommand,
	redactPath,
} from "./boot-diagnostics";
import {
	appServerDatabasePath,
	appServerTokenFilePath,
	daedalusGlobalStateDir,
	readServerManifest,
	type ServerManifest,
	writeServerManifest,
} from "./server-manifest";

export interface AppServerEndpoint {
	readonly endpoint: string;
	readonly wsEndpoint?: string;
	readonly tokenFile: string;
	readonly dbPath: string;
	readonly pid: number;
	readonly appServerVersion: string;
	readonly bootDiagnostics?: AppServerBootDiagnostics;
}

export interface EnsureAppServerOptions {
	readonly stateDir?: string;
	readonly projectRoot?: string;
	readonly packaged?: boolean;
	readonly appServerBinary?: string;
	readonly appServerVersion?: string;
	readonly readinessTimeoutMs?: number;
	readonly env?: NodeJS.ProcessEnv;
}

export function isPidRunning(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function isServerHealthy(endpoint: string, tokenFile?: string): Promise<boolean> {
	try {
		const headers: Record<string, string> = {};
		if (tokenFile && existsSync(tokenFile))
			headers.authorization = `Bearer ${readFileSync(tokenFile, "utf8").trim()}`;
		const response = await fetch(new URL("/health", endpoint), { headers });
		return response.ok;
	} catch {
		return false;
	}
}

export async function isGuiServerHealthy(endpoint: string, tokenFile?: string): Promise<boolean> {
	if (!(await isServerHealthy(endpoint, tokenFile))) return false;
	try {
		const headers: Record<string, string> = {};
		if (tokenFile && existsSync(tokenFile))
			headers.authorization = `Bearer ${readFileSync(tokenFile, "utf8").trim()}`;
		const response = await fetch(new URL("/", endpoint), { headers });
		if (!response.ok) return false;
		const html = await response.text();
		return html.includes('name="daedalus-app"') && html.includes('content="gui"');
	} catch {
		return false;
	}
}

export async function ensureAppServer(options: EnsureAppServerOptions = {}): Promise<AppServerEndpoint> {
	const startedAt = Date.now();
	const diagnostics = createBootDiagnostics("Ensuring desktop app server");
	const stateDir = options.stateDir ?? daedalusGlobalStateDir();
	const manifest = readServerManifest(join(stateDir, "app-server.json"));
	const manifestStageStartedAt = Date.now();
	if (manifest) {
		const pidHealthy = isPidRunning(manifest.pid);
		diagnostics.pidHealthy = pidHealthy;
		diagnostics.tokenFilePath = redactPath(manifest.tokenFile);
		diagnostics.dbPath = manifest.dbPath;
		recordBootStage(
			diagnostics,
			"manifest-reuse",
			"pending",
			`Found manifest for ${manifest.endpoint}`,
			manifestStageStartedAt,
		);
		recordBootStage(
			diagnostics,
			"pid-health",
			pidHealthy ? "ok" : "failed",
			`PID ${manifest.pid} ${pidHealthy ? "is running" : "is not running"}`,
		);
		if (
			pidHealthy &&
			(options.packaged
				? await isGuiServerHealthy(manifest.endpoint, manifest.tokenFile)
				: await isServerHealthy(manifest.endpoint, manifest.tokenFile))
		) {
			diagnostics.manifestReused = true;
			recordBootStage(diagnostics, "manifest-reuse", "ok", "Reusing healthy app-server manifest");
			return {
				...manifest,
				bootDiagnostics: finalizeBootDiagnostics(diagnostics, {
					ready: true,
					message: "Reused healthy app-server manifest",
					durationMs: Date.now() - startedAt,
				}),
			};
		}
	}
	try {
		return await startAppServer({ ...options, stateDir }, diagnostics, startedAt);
	} catch (error) {
		if (error instanceof Error && !("bootDiagnostics" in error)) {
			throw attachBootDiagnostics(
				error,
				finalizeBootDiagnostics(diagnostics, {
					ready: false,
					error: error.message,
					durationMs: Date.now() - startedAt,
				}),
			);
		}
		throw error;
	}
}

export async function startAppServer(
	options: EnsureAppServerOptions = {},
	diagnostics = createBootDiagnostics("Starting desktop app server"),
	startedAt = Date.now(),
): Promise<AppServerEndpoint> {
	const stateDir = options.stateDir ?? daedalusGlobalStateDir();
	mkdirSync(stateDir, { recursive: true });
	const tokenFile = appServerTokenFilePath(stateDir);
	const dbPath = appServerDatabasePath(stateDir);
	diagnostics.tokenFilePath = redactPath(tokenFile);
	diagnostics.dbPath = dbPath;
	recordBootStage(diagnostics, "token-file", "ok", `Token file: ${diagnostics.tokenFilePath}`);
	recordBootStage(diagnostics, "db-path", "ok", `Database path: ${dbPath}`);
	ensureTokenFile(tokenFile);
	const child = spawnAppServer({ ...options, stateDir, tokenFile, dbPath }, diagnostics);
	try {
		const ready = await waitForReadiness(child, options.readinessTimeoutMs ?? 10_000, diagnostics);
		const endpoint = ready.httpUrl ?? ready.endpoint;
		if (!endpoint) throw new Error("App server readiness JSON did not include httpUrl or endpoint");
		const manifest: ServerManifest = {
			endpoint,
			pid: child.pid ?? 0,
			tokenFile,
			dbPath,
			appServerVersion: options.appServerVersion ?? "0.1.0",
		};
		writeServerManifest(manifest, join(stateDir, "app-server.json"));
		return {
			...manifest,
			wsEndpoint: ready.wsUrl,
			bootDiagnostics: finalizeBootDiagnostics(diagnostics, {
				ready: true,
				message: "App server ready",
				durationMs: Date.now() - startedAt,
			}),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (error instanceof Error) {
			throw attachBootDiagnostics(
				error,
				finalizeBootDiagnostics(diagnostics, { ready: false, error: message, durationMs: Date.now() - startedAt }),
			);
		}
		throw attachBootDiagnostics(
			new Error(message),
			finalizeBootDiagnostics(diagnostics, { ready: false, error: message, durationMs: Date.now() - startedAt }),
		);
	}
}

export function spawnAppServer(
	options: EnsureAppServerOptions & { stateDir: string; tokenFile: string; dbPath: string },
	diagnostics?: ReturnType<typeof createBootDiagnostics>,
): ChildProcessWithoutNullStreams {
	const spawnCommand = resolveAppServerSpawnCommand(options);
	if (diagnostics) {
		const redactedSpawnCommand = [...redactCommand(spawnCommand.command, spawnCommand.args, [options.tokenFile])];
		diagnostics.runtime = {
			kind: spawnCommand.kind,
			command: redactedSpawnCommand[0] ?? spawnCommand.command,
			args: redactedSpawnCommand.slice(1),
		};
		diagnostics.spawnCommand = redactedSpawnCommand;
		recordBootStage(diagnostics, "runtime-resolution", "ok", `${spawnCommand.kind}: ${spawnCommand.command}`);
		recordBootStage(diagnostics, "app-server-spawning", "ok", "Spawned app server process");
		recordBootStage(diagnostics, "spawn-command", "ok", redactedSpawnCommand.join(" "));
	}
	const env = { ...process.env, ...(options.env ?? {}) };
	if (options.packaged && process.resourcesPath) {
		env.DAEDALUS_GUI_DIST_DIR ??= join(process.resourcesPath, "gui", "dist");
	}
	return spawn(spawnCommand.command, [...spawnCommand.args], { env });
}

export function resolveAppServerSpawnCommand(
	options: EnsureAppServerOptions & { stateDir: string; tokenFile: string; dbPath: string },
): PackagedAppServerRuntime {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const projectRoot = options.projectRoot ?? process.env.DAEDALUS_PROJECT_ROOT ?? resolve(moduleDir, "..", "..", "..");
	const args = [
		"--db",
		options.dbPath,
		"--host",
		"127.0.0.1",
		"--port",
		"0",
		"--token-file",
		options.tokenFile,
		"--gui",
		"--project",
		projectRoot,
	];
	if (options.packaged) {
		const runtime = resolvePackagedAppServerRuntime({
			appServerBinary: options.appServerBinary,
			resourcesPath: process.resourcesPath,
			projectRoot,
		});
		return { command: runtime.command, args: [...runtime.args, ...args], kind: runtime.kind };
	}
	return {
		command: "bun",
		args: ["--cwd", join(projectRoot, "packages", "app-server"), "src/server/main.ts", ...args],
		kind: "bun-script",
	};
}

export interface PackagedAppServerRuntime {
	readonly command: string;
	readonly args: readonly string[];
	readonly kind: "binary" | "bun-script";
}

export function resolvePackagedAppServerRuntime(options: {
	readonly appServerBinary?: string;
	readonly resourcesPath?: string;
	readonly projectRoot?: string;
}): PackagedAppServerRuntime {
	if (options.appServerBinary) return { command: options.appServerBinary, args: [], kind: "binary" };
	const resourcesRoot = options.resourcesPath ?? options.projectRoot ?? process.cwd();
	const binary = join(
		resourcesRoot,
		"app-server",
		process.platform === "win32" ? "daedalus-app-server.exe" : "daedalus-app-server",
	);
	if (existsSync(binary)) return { command: binary, args: [], kind: "binary" };
	const fallback = join(resourcesRoot, "app-server", "main.ts");
	if (existsSync(fallback)) return { command: "bun", args: [fallback], kind: "bun-script" };
	return { command: binary, args: [], kind: "binary" };
}

export function ensureTokenFile(tokenFile: string): string {
	mkdirSync(dirname(tokenFile), { recursive: true });
	if (!existsSync(tokenFile))
		writeFileSync(tokenFile, `${crypto.randomUUID()}${crypto.randomUUID()}\n`, { encoding: "utf8", mode: 0o600 });
	return tokenFile;
}

export interface ReadinessJson {
	readonly httpUrl?: string;
	readonly wsUrl?: string;
	readonly endpoint?: string;
}

export function parseReadinessLine(line: string): ReadinessJson | undefined {
	try {
		const value = JSON.parse(line) as ReadinessJson;
		if (typeof value.httpUrl === "string" || typeof value.endpoint === "string") return value;
		return undefined;
	} catch {
		return undefined;
	}
}

export function waitForReadiness(
	child: ChildProcess,
	timeoutMs: number,
	diagnostics = createBootDiagnostics("Waiting for app-server readiness"),
): Promise<ReadinessJson> {
	return new Promise((resolveReady, reject) => {
		let buffer = "";
		let settled = false;
		const settle = (callback: () => void): void => {
			if (settled) return;
			settled = true;
			cleanup();
			callback();
		};
		const timer = setTimeout(() => {
			diagnostics.timedOut = true;
			recordBootStage(diagnostics, "timeout", "failed", `Timed out waiting ${timeoutMs}ms for app server readiness`);
			child.kill();
			settle(() => reject(new Error(`Timed out waiting ${timeoutMs}ms for app server readiness`)));
		}, timeoutMs);
		const cleanup = () => clearTimeout(timer);
		child.stdout?.on("data", (chunk) => {
			const text = String(chunk);
			diagnostics.stdoutExcerpt = appendExcerpt(diagnostics.stdoutExcerpt, text);
			buffer += text;
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				const ready = parseReadinessLine(line.trim());
				if (ready) {
					diagnostics.readinessJson = ready;
					recordBootStage(diagnostics, "readiness-json", "ok", "Received app-server readiness JSON");
					settle(() => resolveReady(ready));
				}
			}
		});
		child.stderr?.on("data", (chunk) => {
			diagnostics.stderrExcerpt = appendExcerpt(diagnostics.stderrExcerpt, String(chunk));
		});
		child.once("error", (error) => {
			recordBootStage(diagnostics, "app-server-spawning", "failed", error.message);
			settle(() => reject(error));
		});
		child.once("exit", (code) => {
			diagnostics.exitCode = code;
			recordBootStage(diagnostics, "exit", "failed", `App server exited before readiness: ${code ?? "signal"}`);
			settle(() => reject(new Error(`App server exited before readiness: ${code ?? "signal"}`)));
		});
	});
}
