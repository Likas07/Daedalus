import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getToolDebugLogPath, isToolDebugEnabled, logToolDebug, summarizeToolTransition } from "../src/core/tool-debug.js";

describe("tool debug logging", () => {
	afterEach(() => {
		const debugLogPath = process.env.DAEDALUS_DEBUG_TOOLS_FILE;
		delete process.env.DAEDALUS_DEBUG_TOOLS;
		delete process.env.DAEDALUS_DEBUG_TOOLS_FILE;
		if (debugLogPath && existsSync(debugLogPath)) {
			rmSync(debugLogPath, { force: true });
		}
		vi.restoreAllMocks();
	});

	test("is disabled by default and enabled by truthy env values", () => {
		expect(isToolDebugEnabled({} as NodeJS.ProcessEnv)).toBe(false);
		expect(isToolDebugEnabled({ DAEDALUS_DEBUG_TOOLS: "1" } as NodeJS.ProcessEnv)).toBe(true);
		expect(isToolDebugEnabled({ DAEDALUS_DEBUG_TOOLS: "true" } as NodeJS.ProcessEnv)).toBe(true);
	});

	test("formats tool transitions with added and removed tools", () => {
		expect(summarizeToolTransition(["read", "edit"], ["read", "hashline_edit"])).toBe(
			"prev=[read,edit] next=[read,hashline_edit] added=[hashline_edit] removed=[edit]",
		);
	});

	test("highlights edit-related logs when edit appears in the tool sets", () => {
		process.env.DAEDALUS_DEBUG_TOOLS = "1";
		process.env.DAEDALUS_DEBUG_TOOLS_FILE = join(tmpdir(), `tool-debug-${Date.now()}-edit.log`);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		logToolDebug("scope", "message", {
			requested: ["read", "edit"],
			next: ["read", "edit"],
			details: { source: "test" },
		});

		expect(errorSpy).toHaveBeenCalledWith("[tool-debug:edit] scope | message | source=test");
	});

	test("uses the normal prefix for non-edit tool transitions", () => {
		process.env.DAEDALUS_DEBUG_TOOLS = "1";
		process.env.DAEDALUS_DEBUG_TOOLS_FILE = join(tmpdir(), `tool-debug-${Date.now()}-normal.log`);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		logToolDebug("scope", "message", {
			requested: ["read", "hashline_edit"],
			next: ["read", "hashline_edit"],
			details: { source: "test" },
		});

		expect(errorSpy).toHaveBeenCalledWith("[tool-debug] scope | message | source=test");
	});

	test("persists debug logs to the configured file path", () => {
		process.env.DAEDALUS_DEBUG_TOOLS = "1";
		process.env.DAEDALUS_DEBUG_TOOLS_FILE = join(tmpdir(), `tool-debug-${Date.now()}-persist.log`);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		logToolDebug("scope", "message", {
			requested: ["read", "hashline_edit"],
			next: ["read", "hashline_edit"],
			details: { source: "test" },
		});

		const debugLogPath = getToolDebugLogPath();
		expect(readFileSync(debugLogPath, "utf-8")).toContain("[tool-debug] scope | message | source=test");
		expect(errorSpy).toHaveBeenCalledWith("[tool-debug] scope | message | source=test");
	});
});
