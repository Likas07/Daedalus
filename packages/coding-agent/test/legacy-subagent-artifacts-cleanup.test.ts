import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import { getBundledStarterAgents } from "../src/extensions/daedalus/workflow/subagents/bundled.js";

describe("legacy subagent artifact cleanup", () => {
	it("bundled worker prompt no longer mentions scout/planner/reviewer", () => {
		const worker = getBundledStarterAgents().find((agent) => agent.name === "worker");
		const prompt = worker?.systemPrompt ?? "";
		expect(prompt).not.toMatch(/scout|planner|reviewer/i);
	});

	it("does not keep legacy scout/planner/reviewer bundled prompt artifacts alongside the redesigned runtime set", () => {
		const legacyArtifacts = [
			"scout.md",
			"planner.md",
			"reviewer.md",
			"scout-overrides-gpt.md",
			"scout-overrides-claude.md",
			"planner-overrides-gpt.md",
			"planner-overrides-claude.md",
			"reviewer-overrides-gpt.md",
			"reviewer-overrides-claude.md",
		];

		for (const artifact of legacyArtifacts) {
			expect(fs.existsSync(new URL(`../src/extensions/daedalus/workflow/subagents/agents/${artifact}`, import.meta.url))).toBe(false);
		}
	});
});
