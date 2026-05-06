import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { $ } from "bun";
import {
	defaultGuiDevPort,
	electronChromiumFlags,
	electronDevCommand,
	guiDevPort,
	guiDevUrl,
	isDaedalusGuiServing,
	isUrlServing,
	linuxElectronChromiumFlags,
	waitForUrl,
} from "./dev";

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

	test("generic HTTP 200 is not detected as the Daedalus GUI", async () => {
		expect(
			await isDaedalusGuiServing("http://example.test", async () => new Response("<title>Other App</title>")),
		).toBe(false);
	});

	test("Daedalus GUI index is detected", async () => {
		const index = await readFile(resolve(import.meta.dir, "../../gui/index.html"), "utf8");
		expect(await isDaedalusGuiServing("http://example.test", async () => new Response(index))).toBe(true);
	});

	test("T3-derived GUI shell without the Daedalus app marker is not detected", async () => {
		const index = '<div id="root"></div><script type="module" src="/src/main.tsx"></script>';
		expect(await isDaedalusGuiServing("http://example.test", async () => new Response(index))).toBe(false);
	});

	test("desktop dev URL uses the high default GUI dev port and env override", () => {
		expect(guiDevPort({})).toBe(defaultGuiDevPort);
		expect(guiDevUrl({})).toBe(`http://127.0.0.1:${defaultGuiDevPort}/`);
		expect(defaultGuiDevPort).toBeGreaterThanOrEqual(49_152);
		expect(guiDevPort({ DAEDALUS_GUI_DEV_PORT: "61234" })).toBe(61234);
		expect(guiDevUrl({ DAEDALUS_GUI_DEV_PORT: "61234" })).toBe("http://127.0.0.1:61234/");
		expect(() => guiDevPort({ DAEDALUS_GUI_DEV_PORT: "nope" })).toThrow("DAEDALUS_GUI_DEV_PORT must be");
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

	test("adds Linux Chromium compatibility flags before the Electron dev main entry", () => {
		expect(electronChromiumFlags("linux")).toEqual([...linuxElectronChromiumFlags]);
		expect(electronDevCommand("/repo/packages/desktop/.daedalus/desktop-dev/main.js", "linux")).toEqual([
			"electron",
			...linuxElectronChromiumFlags,
			"/repo/packages/desktop/.daedalus/desktop-dev/main.js",
		]);
		expect(linuxElectronChromiumFlags).toContain("--disable-gpu");
		expect(linuxElectronChromiumFlags).toContain("--disable-accelerated-video-decode");
		expect(linuxElectronChromiumFlags).toContain("--ozone-platform=x11");
	});

	test("leaves non-Linux Electron dev launches unchanged", () => {
		expect(electronChromiumFlags("darwin")).toEqual([]);
		expect(electronDevCommand("/repo/packages/desktop/.daedalus/desktop-dev/main.js", "darwin")).toEqual([
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
