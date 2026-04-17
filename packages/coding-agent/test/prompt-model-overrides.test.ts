import { describe, expect, it } from "vitest";
import { buildSubagentAppendPrompts } from "../src/core/subagents/runtime-config.js";
import { getBundledStarterAgents } from "../src/extensions/daedalus/workflow/subagents/bundled.js";
import { buildSystemPrompt } from "../src/core/system-prompt.js";

describe("main prompt model overrides", () => {
	it("applies GPT override text when the model looks like GPT", () => {
		const prompt = buildSystemPrompt({
			selectedTools: [],
			contextFiles: [],
			skills: [],
			modelId: "gpt-5.4",
		});

		expect(prompt).toContain("# Daedalus GPT Override");
		expect(prompt).not.toContain("# Daedalus Claude Override");
	});

	it("applies Claude override text when the model looks like Claude", () => {
		const prompt = buildSystemPrompt({
			selectedTools: [],
			contextFiles: [],
			skills: [],
			modelId: "claude-sonnet-4-6",
		});

		expect(prompt).toContain("# Daedalus Claude Override");
		expect(prompt).not.toContain("# Daedalus GPT Override");
	});

	it("applies worker GPT override after the canonical role prompt", () => {
		const prompts = buildSubagentAppendPrompts({
			agent: {
				name: "worker",
				systemPrompt: "# Worker Canonical\n\nDo the work.",
				modelOverrides: {
					gpt: "# Worker GPT Override\n\nBe extremely explicit about verification.",
				},
			},
			packetText: "Goal: patch auth flow",
			modelId: "gpt-5.4",
		});

		expect(prompts[1]).toContain("# Worker Canonical");
		expect(prompts[2]).toContain("# Worker GPT Override");
	});

	it("attaches GPT and Claude override text to bundled worker", () => {
		const worker = getBundledStarterAgents().find((agent) => agent.name === "worker");

		expect(worker?.modelOverrides?.gpt).toContain("# Worker GPT Override");
		expect(worker?.modelOverrides?.claude).toContain("# Worker Claude Override");
	});
});
