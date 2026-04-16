import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Regression test for https://github.com/badlogic/pi-mono/issues/2791
 *
 * fs.watch() returns an FSWatcher (EventEmitter). If the watcher emits an
 * 'error' event after creation and no error handler is attached, the process
 * treats it as an uncaught exception and terminates.
 */
describe("issue #2791 fs.watch error event crashes process", () => {
	let tempRoot: string;

	beforeEach(() => {
		tempRoot = mkdtempSync(join(tmpdir(), "pi-2791-"));
		const agentDir = join(tempRoot, "agent");
		const themesDir = join(agentDir, "themes");
		mkdirSync(themesDir, { recursive: true });

		const darkThemePath = fileURLToPath(
			new URL("../../../src/modes/interactive/theme/dark.json", import.meta.url),
		);
		const darkTheme = JSON.parse(readFileSync(darkThemePath, "utf-8"));
		darkTheme.name = "custom-test";
		writeFileSync(join(themesDir, "custom-test.json"), JSON.stringify(darkTheme, null, 2));
	});

	afterEach(() => {
		rmSync(tempRoot, { recursive: true, force: true });
	});

	it("process should survive an error event on the theme FSWatcher", () => {
		const themeModuleUrl = new URL("../../../src/modes/interactive/theme/theme.ts", import.meta.url).href;
		const agentDir = join(tempRoot, "agent");
		const scriptPath = join(tempRoot, "test-watcher-error.mjs");

		writeFileSync(
			scriptPath,
			`
import { EventEmitter } from "node:events";

process.env.DAEDALUS_CODING_AGENT_DIR = ${JSON.stringify(agentDir)};

const originalOn = EventEmitter.prototype.on;
let capturedWatcher;
EventEmitter.prototype.on = function(event, listener) {
	if (event === "error" && this?.constructor?.name === "FSWatcher") {
		capturedWatcher = this;
	}
	return originalOn.call(this, event, listener);
};

const { setTheme, stopThemeWatcher } = await import(${JSON.stringify(themeModuleUrl)});
const result = setTheme("custom-test", true);
if (!result.success) {
	process.stderr.write(String(result.error ?? "setTheme failed") + "\\n");
	process.exit(3);
}

if (!capturedWatcher) {
	process.stderr.write("theme watcher was not created\\n");
	process.exit(2);
}

const errorListenerCount = capturedWatcher.listenerCount("error");
if (errorListenerCount === 0) {
	process.stderr.write("BUG: FSWatcher has no error handler (issue #2791)\\n");
}

try {
	capturedWatcher.emit("error", new Error("simulated OS watcher failure"));
} catch {
	process.stderr.write("error event was unhandled and threw\\n");
	process.exit(1);
} finally {
	EventEmitter.prototype.on = originalOn;
}

stopThemeWatcher();
process.exit(0);
`,
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: tempRoot,
			timeout: 10000,
			encoding: "utf-8",
			env: { ...process.env, DAEDALUS_CODING_AGENT_DIR: agentDir },
			stdio: ["pipe", "pipe", "pipe"],
		});

		if (result.error) {
			throw result.error;
		}

		const stdout = result.stdout ?? "";
		const stderr = result.stderr ?? "";
		expect(result.status, `Child crashed (exit ${result.status}). stdout: ${stdout.trim()} stderr: ${stderr.trim()}`).toBe(0);
	});
});
