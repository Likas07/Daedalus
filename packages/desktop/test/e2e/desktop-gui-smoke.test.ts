import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toRendererServerBootstrap } from "../../src/native-bridge";

import { NativeCommandRouter } from "../../src/native-command-router";
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

	test("routes desktop-native menu commands, folder picker intents, recents, and deep links into renderer envelopes", () => {
		const sent: unknown[] = [];
		const router = new NativeCommandRouter({
			getMainWindow: () => ({
				webContents: { send: (_channel: string, payload: unknown) => sent.push(payload) } as never,
			}),
		});
		const projectPath = join(tmpdir(), "daedalus-desktop-project");
		const url = "daedalus://open?project=project-1&session=session-1&worktree=worktree-1";
		router.send("open-project", { path: projectPath });
		router.send("open-recent-project", { path: projectPath });
		router.send("open-file", {});
		router.send("open-folder", {});
		router.send("open-folder", { path: projectPath });
		router.send("open-external-editor", { path: join(projectPath, "file.txt") });
		router.send("toggle-terminal", {});
		router.send("export-diagnostics", {});
		router.send("show-notification", { kind: "run-completed", body: "done" });
		router.send("open-deep-link", { url });
		expect(url).toBe("daedalus://open?project=project-1&session=session-1&worktree=worktree-1");
		expect(sent).toEqual([
			{ id: "open-project", payload: { path: projectPath } },
			{ id: "open-recent-project", payload: { path: projectPath } },
			{ id: "open-file", payload: {} },
			{ id: "open-folder", payload: {} },
			{ id: "open-folder", payload: { path: projectPath } },
			{ id: "open-external-editor", payload: { path: join(projectPath, "file.txt") } },
			{ id: "toggle-terminal", payload: {} },
			{ id: "export-diagnostics", payload: {} },
			{ id: "show-notification", payload: { kind: "run-completed", body: "done" } },
			{ id: "open-deep-link", payload: { url } },
		]);
		expect(() => router.send("open-folder", { path: "" })).toThrow("Native command path must not be empty");
		expect(() => router.send("open-deep-link", { url: "javascript:alert(1)" })).toThrow(
			"Unsupported native command URL",
		);
	});
});
