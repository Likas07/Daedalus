import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../src/core/system-prompt.js";

describe("coding discipline system prompt overlay", () => {
	it("includes the coding discipline section before available tools", () => {
		const prompt = buildSystemPrompt({ selectedTools: [], contextFiles: [], skills: [] });

		expect(prompt).toContain("## Coding Discipline");
		expect(prompt).toContain("Be grounded in reality");
		expect(prompt).toContain("Plan in todos for multi-step tasks");
		expect(prompt).toContain("Semantic search first for unfamiliar code");
		expect(prompt).toContain("Parallelize independent tool calls");
		expect(prompt).toContain("Prefer specialized tools over shell");
		expect(prompt).toContain("Do not use subagents for initial exploration");
		expect(prompt).toContain("Validate before finalizing");
		expect(prompt).toContain("Do not delete failing tests");
		expect(prompt).toContain("Address root causes, not symptoms.");

		expect(prompt.indexOf("## Coding Discipline")).toBeLessThan(prompt.indexOf("Available tools:"));
	});
});
