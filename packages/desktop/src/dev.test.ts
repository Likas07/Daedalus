import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { electronDevCommand, isUrlServing, waitForUrl } from "./dev";

describe("desktop dev launcher helpers", () => {
	test("isUrlServing returns true only for successful responses", async () => {
		expect(await isUrlServing("http://example.test", async () => new Response("ok", { status: 200 }))).toBe(true);
		expect(await isUrlServing("http://example.test", async () => new Response("missing", { status: 404 }))).toBe(
			false,
		);
		expect(
			await isUrlServing("http://example.test", async () => {
				throw new Error("connection refused");
			}),
		).toBe(false);
	});

	test("waitForUrl waits until a URL serves successfully", async () => {
		let attempts = 0;
		await waitForUrl("http://example.test", {
			intervalMs: 1,
			timeoutMs: 100,
			fetcher: async () => {
				attempts += 1;
				return new Response("ok", { status: attempts >= 3 ? 200 : 503 });
			},
		});
		expect(attempts).toBe(3);
	});

	test("waitForUrl reports timeout when a URL never serves", async () => {
		await expect(
			waitForUrl("http://example.test", {
				intervalMs: 1,
				timeoutMs: 5,
				fetcher: async () => new Response("not ready", { status: 503 }),
			}),
		).rejects.toThrow("Timed out waiting for http://example.test: HTTP 503");
	});

	test("launches Electron from the freshly built dev main entry", () => {
		expect(electronDevCommand("/repo/packages/desktop/.daedalus/desktop-dev/main.js")).toEqual([
			"electron",
			"/repo/packages/desktop/.daedalus/desktop-dev/main.js",
		]);
	});

	test("dev preload build exposes the native bridge without importing app-only modules", async () => {
		const desktopRoot = resolve(import.meta.dir, "..");
		await $`bun run build:dev`.cwd(desktopRoot).quiet();
		const preload = await readFile(resolve(desktopRoot, ".daedalus/desktop-dev/preload.cjs"), "utf8");

		expect(preload).toContain("contextBridge.exposeInMainWorld(nativeBridgeApiName, bridge)");
		expect(preload).toContain('var nativeBridgeApiName = "daedalusNative"');
		expect(preload).toContain(
			'bootstrapEndpoint: () => import_electron.ipcRenderer.invoke("daedalus:server:bootstrap-endpoint")',
		);
		expect(preload).not.toContain('from "node:');
		expect(preload).not.toContain("readFileSync");
		expect(preload).not.toContain("NativeCommandRouter");
	});
});
