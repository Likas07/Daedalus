import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSubagentAppendPrompts, SUBAGENT_BASE_CONTRACT } from "../src/core/subagents/runtime-config.js";

describe("subagent base contract", () => {
	it("loads the shared delegated-task contract from markdown before the role prompt", () => {
		const contractPath = join(import.meta.dir, "../src/core/subagents/subagent-base-contract.md");
		expect(existsSync(contractPath)).toBe(true);

		const markdownContract = readFileSync(contractPath, "utf8").trim();
		expect(SUBAGENT_BASE_CONTRACT).toBe(markdownContract);

		const prompts = buildSubagentAppendPrompts({
			agent: { systemPrompt: "You are the worker subagent." },
			packetText: "Goal: patch auth flow",
		});

		expect(prompts[0]).toBe(markdownContract);
		expect(prompts[1]).toContain("You are the worker subagent.");
	});

	it("includes bounded autonomy, lane ownership, and result-submission rules in the shared contract", () => {
		expect(SUBAGENT_BASE_CONTRACT).toContain("bounded autonomy");
		expect(SUBAGENT_BASE_CONTRACT).toContain("one delegated lane in a broader plan");
		expect(SUBAGENT_BASE_CONTRACT).toContain("required result-submission behavior");
		expect(SUBAGENT_BASE_CONTRACT).toContain("Return scoped results for the parent");
		expect(SUBAGENT_BASE_CONTRACT).toContain("If blocked by a dependency or missing prerequisite, report the blocker explicitly.");
	});

	it("distinguishes parent-facing summary from deliverable content", () => {
		expect(SUBAGENT_BASE_CONTRACT).toContain("Use summary for the parent-facing status");
		expect(SUBAGENT_BASE_CONTRACT).toContain("Use deliverable for the actual requested output");
		expect(SUBAGENT_BASE_CONTRACT).toContain("Do not duplicate another lane's work or broaden scope to adjacent tasks.");
	});
});
