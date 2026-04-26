import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toRendererServerBootstrap } from "../../src/native-bridge";
import { resolvePackagedAppServerRuntime } from "../../src/server-process";

describe("desktop GUI E2E smoke", () => {
	test("validates packaged app-server path contract without launching Electron", () => {
		const resources = mkdtempSync(join(tmpdir(), "daedalus-desktop-runtime-"));
		try {
			const appServerDir = join(resources, "app-server");
			mkdirSync(appServerDir, { recursive: true });
			writeFileSync(join(appServerDir, "main.ts"), "console.log('ready')\n");
			expect(resolvePackagedAppServerRuntime({ resourcesPath: resources })).toEqual({
				command: "bun",
				args: [join(appServerDir, "main.ts")],
				kind: "bun-script",
			});
		} finally {
			rmSync(resources, { recursive: true, force: true });
		}
	});

	test("creates renderer app-server bootstrap without requiring a graphical display", () => {
		const resources = mkdtempSync(join(tmpdir(), "daedalus-desktop-bootstrap-"));
		try {
			const tokenFile = join(resources, "token");
			writeFileSync(tokenFile, "desktop-token\n");
			const bootstrap = toRendererServerBootstrap({
				endpoint: "http://127.0.0.1:4173",
				wsEndpoint: "ws://127.0.0.1:4173/ws",
				tokenFile,
				dbPath: join(resources, "app.sqlite"),
				appServerVersion: "smoke",
			});
			expect(bootstrap).toEqual({
				endpoint: "http://127.0.0.1:4173",
				wsEndpoint: "ws://127.0.0.1:4173/ws",
				token: "desktop-token",
				dbPath: join(resources, "app.sqlite"),
				appServerVersion: "smoke",
			});
		} finally {
			rmSync(resources, { recursive: true, force: true });
		}
	});
});
