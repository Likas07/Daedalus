import { describe, expect, it } from "vitest";
import { buildSubagentSystemPrompt } from "../src/core/subagents/subagent-system-prompt.js";

describe("subagent system prompt", () => {
	it("does not inherit Daedalus constitutional identity", () => {
		const prompt = buildSubagentSystemPrompt({
			rolePrompt: "You are Hephaestus (worker), a delegated implementation specialist.",
			packetText: "Goal: patch auth flow",
		});

		expect(prompt).not.toContain("The primary assistant is Daedalus");
		expect(prompt).toContain("You are Hephaestus (worker)");
	});

	it("keeps the shared delegated-agent contract before the role prompt", () => {
		const prompt = buildSubagentSystemPrompt({
			rolePrompt: "You are Hephaestus (worker), a delegated implementation specialist.",
			packetText: "Goal: patch auth flow",
		});

		expect(prompt.indexOf("You are operating on a delegated sub-task.")).toBeLessThan(
			prompt.indexOf("You are Hephaestus (worker)"),
		);
	});
});
