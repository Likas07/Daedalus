import { describe, expect, it } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.js";
import { buildSubagentAppendPrompts, resolveSubagentRuntimeConfig } from "../src/core/subagents/runtime-config.js";
import type { SubagentDefinition } from "../src/core/subagents/types.js";

const agent: SubagentDefinition = {
	name: "scout",
	description: "Find files",
	systemPrompt: "You are the scout subagent.",
	source: "bundled",
	model: "anthropic/claude-sonnet-4-5",
	thinkingLevel: "low",
	toolPolicy: {
		allowedTools: ["read", "grep", "find", "ls"],
		writableGlobs: [],
		spawns: [],
		maxDepth: 1,
	},
};

describe("resolveSubagentRuntimeConfig", () => {
	it("prefers settings overrides over agent defaults", () => {
		const settings = SettingsManager.inMemory({
			subagents: {
				agents: {
					scout: { model: "anthropic/claude-haiku-4-5", thinkingLevel: "minimal" },
				},
			},
		});
		const modelRegistry = {
			find: (provider: string, modelId: string) => ({ provider, id: modelId }),
		} as any;

		const runtime = resolveSubagentRuntimeConfig({
			request: {
				agent,
				parentSessionFile: "/tmp/parent.jsonl",
				goal: "Trace auth flow",
				assignment: "Inspect auth entrypoints.",
			},
			packetText: "Goal: Trace auth flow\n\nInspect auth entrypoints.",
			settingsManager: settings,
			modelRegistry,
		});

		expect(runtime.model?.provider).toBe("anthropic");
		expect(runtime.model?.id).toBe("claude-haiku-4-5");
		expect(runtime.thinkingLevel).toBe("minimal");
	});

	it("builds a prompt with base contract, role prompt, and compact packet", () => {
		const prompts = buildSubagentAppendPrompts({
			agent,
			packetText: [
				"Goal: Trace auth flow",
				"",
				"Inspect auth entrypoints.",
				"",
				"Context:",
				"Focus on src/auth.ts and src/session.ts",
			].join("\n"),
		});

		expect(prompts.join("\n\n")).toContain("delegated sub-task");
		expect(prompts.join("\n\n")).toContain("one delegated lane in a broader plan");
		expect(prompts.join("\n\n")).toContain("You are the scout subagent.");
		expect(prompts.join("\n\n")).toContain("Goal: Trace auth flow");
	});

	it("treats the role prompt as the subagent identity/doctrine layer", () => {
		const prompts = buildSubagentAppendPrompts({
			agent: {
				name: "worker",
				systemPrompt:
					"You are Hephaestus (worker), a delegated implementation specialist.\n\n## Operating Mode\n- finish the assigned task fully",
			},
			packetText: "Goal: patch auth flow",
		});

		expect(prompts[1]).toContain("You are Hephaestus (worker)");
		expect(prompts[1]).toContain("## Operating Mode");
	});
});
