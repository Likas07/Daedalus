import { describe, expect, it } from "vitest";
import { buildSubagentSystemPrompt } from "../src/core/subagents/subagent-system-prompt.js";

describe("subagent system prompt", () => {
	it("does not inherit Daedalus constitutional identity", () => {
		const prompt = buildSubagentSystemPrompt({
			rolePrompt: "You are Sage, a delegated read-only research specialist.",
			packetText: "Goal: inspect auth flow",
		});

		expect(prompt).not.toContain("The primary assistant is Daedalus");
		expect(prompt).toContain("You are Sage");
	});

	it("keeps the shared delegated-agent contract before the role prompt", () => {
		const prompt = buildSubagentSystemPrompt({
			rolePrompt: "You are Worker, a delegated implementation specialist.",
			packetText: "Goal: patch auth flow",
		});

		expect(prompt.indexOf("You are operating on a delegated sub-task.")).toBeLessThan(
			prompt.indexOf("You are Worker"),
		);
	});

	it("appends runtime overlays before the delegated task packet", () => {
		const prompt = buildSubagentSystemPrompt({
			rolePrompt: "You are Muse, a delegated planning specialist.",
			runtimeOverlays: ["Execution contract: use { task, status, summary, output }."],
			packetText: "Goal: create implementation plan",
		});

		expect(prompt).toContain("Execution contract: use { task, status, summary, output }.");
		expect(prompt.indexOf("Execution contract: use { task, status, summary, output }."))
			.toBeLessThan(prompt.indexOf("Delegated task packet:"));
	});
});
