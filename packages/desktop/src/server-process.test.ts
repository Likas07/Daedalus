import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toRendererServerBootstrap } from "./native-bridge";
import { appServerTokenFilePath, parseServerManifest, writeServerManifest } from "./server-manifest";
import { ensureAppServer, ensureTokenFile, isPidRunning, waitForReadiness } from "./server-process";

const cleanup: string[] = [];

afterEach(async () => {
	for (const dir of cleanup.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function tempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "daedalus-desktop-test-"));
	cleanup.push(dir);
	return dir;
}

describe("server manifest", () => {
	test("parses valid manifest and rejects invalid content", () => {
		const manifest = parseServerManifest(
			JSON.stringify({
				endpoint: "http://127.0.0.1:1",
				pid: 123,
				tokenFile: "/tmp/t",
				dbPath: "/tmp/db",
				appServerVersion: "0.1.0",
			}),
		);
		expect(manifest?.endpoint).toBe("http://127.0.0.1:1");
		expect(parseServerManifest("not-json")).toBeUndefined();
		expect(
			parseServerManifest(
				JSON.stringify({ endpoint: "x", pid: "bad", tokenFile: "t", dbPath: "d", appServerVersion: "v" }),
			),
		).toBeUndefined();
	});
});

describe("server process", () => {
	test("detects stale pid and starts a replacement server", async () => {
		const stateDir = await tempDir();
		writeServerManifest(
			{
				endpoint: "http://127.0.0.1:9",
				pid: 9_999_999,
				tokenFile: join(stateDir, "old.token"),
				dbPath: join(stateDir, "old.sqlite"),
				appServerVersion: "old",
			},
			join(stateDir, "app-server.json"),
		);
		const endpoint = await ensureAppServer({
			stateDir,
			projectRoot: join(import.meta.dir, "..", "..", ".."),
			readinessTimeoutMs: 5_000,
		});
		expect(endpoint.endpoint.startsWith("http://127.0.0.1:")).toBe(true);
		expect(endpoint.pid).not.toBe(9_999_999);
		expect(isPidRunning(endpoint.pid)).toBe(true);
		process.kill(endpoint.pid);
	});

	test("times out when readiness JSON is not emitted", async () => {
		const child = spawn("bun", ["-e", "setTimeout(() => {}, 1000)"], { stdio: ["ignore", "pipe", "pipe"] });
		await expect(waitForReadiness(child, 25)).rejects.toThrow("Timed out");
	});

	test("generates token file under state dir", async () => {
		const stateDir = await tempDir();
		const tokenFile = appServerTokenFilePath(stateDir);
		expect(tokenFile).toBe(join(stateDir, "app-server.token"));
		ensureTokenFile(tokenFile);
		expect(existsSync(tokenFile)).toBe(true);
	});
});

describe("native bridge server bootstrap", () => {
	test("maps token file to renderer-safe token", async () => {
		const stateDir = await tempDir();
		const tokenFile = join(stateDir, "app-server.token");
		writeFileSync(tokenFile, "desktop-token\n", { encoding: "utf8" });

		const bootstrap = toRendererServerBootstrap({
			endpoint: "http://127.0.0.1:43117",
			wsEndpoint: "ws://127.0.0.1:43117/ws",
			tokenFile,
			dbPath: join(stateDir, "app-server.sqlite"),
			pid: 123,
			appServerVersion: "0.1.0",
		});

		expect(bootstrap).toEqual({
			endpoint: "http://127.0.0.1:43117",
			wsEndpoint: "ws://127.0.0.1:43117/ws",
			token: "desktop-token",
			dbPath: join(stateDir, "app-server.sqlite"),
			appServerVersion: "0.1.0",
		});
		expect("tokenFile" in bootstrap).toBe(false);
	});
});
