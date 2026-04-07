import { describe, expect, test } from "bun:test";
import { Effort } from "@oh-my-pi/pi-ai";
import { parseAgentFields } from "../../src/discovery/agent-fields";

describe("parseAgentFields", () => {
	test("parses blocking from boolean frontmatter", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			blocking: true,
		});

		expect(fields).toBeDefined();
		expect(fields?.blocking).toBe(true);
	});

	test("parses blocking from string frontmatter", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			blocking: "false",
		});

		expect(fields).toBeDefined();
		expect(fields?.blocking).toBe(false);
	});

	test("ignores invalid blocking values", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			blocking: "sometimes",
		});

		expect(fields).toBeDefined();
		expect(fields?.blocking).toBeUndefined();
	});
	test("parses legacy thinking key", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			thinking: "medium",
		});

		expect(fields).toBeDefined();
		expect(fields?.thinkingLevel).toBe(Effort.Medium);
	});

	test("prefers thinking-level over legacy thinking", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			thinking: "minimal",
			thinkingLevel: Effort.High,
		});

		expect(fields?.thinkingLevel).toBe(Effort.High);
	});

	test("lowercases tool names into allowedTools", () => {
		const fields = parseAgentFields({
			name: "reviewer",
			description: "desc",
			tools: ["Read", "Grep"],
		});

		expect(fields?.allowedTools).toEqual(["read", "grep", "submit_result"]);
	});

	test("parses declarative profile metadata", () => {
		const fields = parseAgentFields({
			name: "planner",
			description: "desc",
			role: "plan",
			orchestrationRole: "orchestrator",
			readOnly: "true",
			editScopes: "src/task/**, src/config/**",
		});

		expect(fields).toBeDefined();
		expect(fields?.role).toBe("plan");
		expect(fields?.orchestrationRole).toBe("orchestrator");
		expect(fields?.readOnly).toBe(true);
		expect(fields?.editScopes).toEqual(["src/task/**", "src/config/**"]);
	});
});

test("parses free-code-test style profile knobs and scoped tool rules", () => {
	const fields = parseAgentFields({
		name: "planner",
		description: "desc",
		allowedTools: ["Read", "Write(Docs/*.md)", "Task(worker, reviewer)"],
		deniedTools: ["Bash", "Write(secret/**)"],
		canSpawnAgents: true,
		turnBudget: 80,
		useWorktree: false,
		compactionOverrides: { bufferTokens: 150000, keepRecentTokens: 50000 },
	});

	expect(fields).toBeDefined();
	expect(fields?.allowedTools).toEqual(["read", "write(Docs/*.md)", "task(worker, reviewer)", "submit_result"]);
	expect(fields?.deniedTools).toEqual(["bash", "write(secret/**)"]);
	expect(fields?.canSpawnAgents).toBe(true);
	expect(fields?.turnBudget).toBe(80);
	expect(fields?.useWorktree).toBe(false);
	expect(fields?.compactionOverrides).toEqual({ bufferTokens: 150000, keepRecentTokens: 50000 });
});

test("maps legacy tools field to allowedTools without lowercasing scope patterns", () => {
	const fields = parseAgentFields({
		name: "planner",
		description: "desc",
		tools: ["Read", "Write(Docs/*.md)"],
	});

	expect(fields?.allowedTools).toEqual(["read", "write(Docs/*.md)", "submit_result"]);
});
