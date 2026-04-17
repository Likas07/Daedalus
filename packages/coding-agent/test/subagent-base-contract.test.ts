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
});
