import { type ChildProcess, type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

export async function ensureAppServer(options: EnsureAppServerOptions = {}): Promise<AppServerEndpoint> {
	const stateDir = options.stateDir ?? daedalusGlobalStateDir();
	const manifest = readServerManifest(join(stateDir, "app-server.json"));
	if (manifest && isPidRunning(manifest.pid) && (await isServerHealthy(manifest.endpoint, manifest.tokenFile)))
		return manifest;
	return startAppServer(options);
}

export async function startAppServer(options: EnsureAppServerOptions = {}): Promise<AppServerEndpoint> {
	const stateDir = options.stateDir ?? daedalusGlobalStateDir();
	mkdirSync(stateDir, { recursive: true });
	const tokenFile = appServerTokenFilePath(stateDir);
	const dbPath = appServerDatabasePath(stateDir);
	ensureTokenFile(tokenFile);
	const child = spawnAppServer({ ...options, stateDir, tokenFile, dbPath });
	const ready = await waitForReadiness(child, options.readinessTimeoutMs ?? 10_000);
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
	return { ...manifest, wsEndpoint: ready.wsUrl };
}

export function spawnAppServer(
	options: EnsureAppServerOptions & { stateDir: string; tokenFile: string; dbPath: string },
): ChildProcessWithoutNullStreams {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const projectRoot = options.projectRoot ?? process.env.DAEDALUS_PROJECT_ROOT ?? resolve(moduleDir, "..", "..", "..");
	const args = ["--db", options.dbPath, "--host", "127.0.0.1", "--port", "0", "--token-file", options.tokenFile];
	if (options.packaged) {
		const binary =
			options.appServerBinary ?? join(process.resourcesPath ?? projectRoot, "app-server", "daedalus-app-server");
		return spawn(binary, args, { env: options.env ?? process.env });
	}
	return spawn("bun", ["--cwd", join(projectRoot, "packages", "app-server"), "src/server/main.ts", ...args], {
		env: options.env ?? process.env,
	});
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

export function waitForReadiness(child: ChildProcess, timeoutMs: number): Promise<ReadinessJson> {
	return new Promise((resolveReady, reject) => {
		let buffer = "";
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error(`Timed out waiting ${timeoutMs}ms for app server readiness`));
		}, timeoutMs);
		const cleanup = () => clearTimeout(timer);
		child.stdout?.on("data", (chunk) => {
			buffer += String(chunk);
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				const ready = parseReadinessLine(line.trim());
				if (ready) {
					cleanup();
					resolveReady(ready);
				}
			}
		});
		child.once("error", (error) => {
			cleanup();
			reject(error);
		});
		child.once("exit", (code) => {
			cleanup();
			reject(new Error(`App server exited before readiness: ${code ?? "signal"}`));
		});
	});
}
