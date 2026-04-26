import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { $ } from "bun";
import { describe, expect, test } from "bun:test";

async function electronCommand(): Promise<string[]> {
	const electron = (await import("electron")).default;
	const electronPath = typeof electron === "string" ? electron : "electron";
	if (process.platform === "linux" && !process.env.DISPLAY && existsSync("/usr/bin/xvfb-run")) {
		return ["/usr/bin/xvfb-run", "-a", electronPath, "--no-sandbox", "--disable-dev-shm-usage"];
	}
	return [electronPath, "--no-sandbox", "--disable-dev-shm-usage"];
}

describe("Electron preload bridge smoke", () => {
	test("hidden BrowserWindow exposes server bootstrap endpoint through the real preload", async () => {
		const desktopRoot = resolve(import.meta.dir, "..", "..");
		await $`bun run build:dev`.cwd(desktopRoot).quiet();

		const preload = resolve(desktopRoot, ".daedalus/desktop-dev/preload.cjs");
		const runner = resolve(import.meta.dir, "preload-smoke-runner.mjs");
		const command = await electronCommand();
		const proc = Bun.spawn([...command, runner, preload], {
			cwd: desktopRoot,
			env: {
				...process.env,
				ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(stderr).not.toContain("window.daedalusNative.server.bootstrapEndpoint was not exposed");
		expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
		expect(stdout).toContain('"exposed":true');
		expect(stdout).toContain('"endpoint":"http://127.0.0.1:43117"');
	}, 20_000);
});
