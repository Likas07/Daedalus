import { describe, expect, it } from "vitest";
import { createBashToolDefinition } from "../../src/core/tools/bash.js";

describe("bash prompt doctrine", () => {
	it("reserves bash for real terminal commands instead of file operations", () => {
		const tool = createBashToolDefinition(process.cwd());
		expect(tool.promptGuidelines).toContain(
			"Use specialized tools (read/edit/write/fs_search) instead of bash for file operations. Reserve bash for actual system/terminal commands.",
		);
	});
});
