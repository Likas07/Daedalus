import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface ServerManifest {
	readonly endpoint: string;
	readonly pid: number;
	readonly tokenFile: string;
	readonly dbPath: string;
	readonly appServerVersion: string;
}

export function daedalusGlobalStateDir(home = homedir()): string {
	return join(home, ".daedalus", "desktop");
}

export function serverManifestPath(stateDir = daedalusGlobalStateDir()): string {
	return join(stateDir, "app-server.json");
}

export function appServerDatabasePath(stateDir = daedalusGlobalStateDir()): string {
	return join(stateDir, "app-server.sqlite");
}

export function appServerTokenFilePath(stateDir = daedalusGlobalStateDir()): string {
	return join(stateDir, "app-server.token");
}

export function readServerManifest(path = serverManifestPath()): ServerManifest | undefined {
	if (!existsSync(path)) return undefined;
	try {
		return parseServerManifest(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

export function writeServerManifest(manifest: ServerManifest, path = serverManifestPath()): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");
}

export function parseServerManifest(raw: string): ServerManifest | undefined {
	try {
		const value = JSON.parse(raw) as Partial<ServerManifest>;
		if (typeof value.endpoint !== "string") return undefined;
		if (typeof value.pid !== "number" || !Number.isInteger(value.pid)) return undefined;
		if (typeof value.tokenFile !== "string") return undefined;
		if (typeof value.dbPath !== "string") return undefined;
		if (typeof value.appServerVersion !== "string") return undefined;
		return {
			endpoint: value.endpoint,
			pid: value.pid,
			tokenFile: value.tokenFile,
			dbPath: value.dbPath,
			appServerVersion: value.appServerVersion,
		};
	} catch {
		return undefined;
	}
}

export function testStateDir(prefix = "daedalus-desktop-"): string {
	return join(tmpdir(), `${prefix}${crypto.randomUUID()}`);
}
