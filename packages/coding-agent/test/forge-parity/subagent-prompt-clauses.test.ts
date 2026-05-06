import { describe, expect, it } from "vitest";
import subagentStarterPack from "../../src/extensions/daedalus/workflow/subagents/index.js";

function getRegisteredTool() {
	const tools: any[] = [];
	subagentStarterPack({
		registerTool(tool: any) {
			tools.push(tool);
		},
		registerCommand() {},
		on() {},
	} as any);
	return tools.find((tool) => tool.name === "subagent");
}

describe("subagent prompt doctrine", () => {
	it("discourages exploratory delegation and preserves summary-first semantics", () => {
		const tool = getRegisteredTool();
		expect(tool.promptGuidelines).toContain(
			"Do not launch subagents for initial codebase exploration or simple lookups. Use sem_search first.",
		);
		expect(tool.promptGuidelines).toContain(
			"This exploration limit does not override role routing: use Muse for plans and always use Worker for implementation after minimal grounding.",
		);
		expect(tool.promptGuidelines).toContain(
			"When launching multiple independent tasks, call subagent once per independent task in parallel (single assistant message, multiple tool calls).",
		);
		expect(tool.promptGuidelines).toContain(
			"Keep Daedalus summary-first result semantics: inspect the returned summary/reference first and read deferred full output only when needed.",
		);
	});

	it("documents current subagent isolation and merge-back contract", () => {
		const tool = getRegisteredTool();
		const guidance = tool.promptGuidelines.join("\n");

		expect(guidance).toContain('isolation:"inherit"');
		expect(guidance).toContain('isolation:"shared"');
		expect(guidance).toContain('isolation:"worktree"');
		expect(guidance).toContain("base_branch");
		expect(guidance).toContain('merge_back defaults to "patch"');
		expect(guidance).toContain('merge_back:"patch"');
		expect(guidance).toContain('merge_back:"branch"');

		const parameterSchema = JSON.stringify(tool.parameters);
		expect(parameterSchema).toContain("inherit");
		expect(parameterSchema).toContain("shared");
		expect(parameterSchema).toContain("worktree");
		expect(parameterSchema).toContain("base_branch");
		expect(parameterSchema).toContain("patch");
		expect(parameterSchema).toContain("branch");
		expect(parameterSchema).toContain('Defaults to \\"patch\\" for worktree isolation');
	});

	it("adds Daedalus orchestration guidance to the system prompt instead of a hidden custom message", async () => {
		const beforeAgentStartHandlers: any[] = [];
		subagentStarterPack({
			registerTool() {},
			registerCommand() {},
			on(event: string, handler: any) {
				if (event === "before_agent_start") {
					beforeAgentStartHandlers.push(handler);
				}
			},
			getActiveTools: () => [],
			setActiveTools() {},
		} as any);

		const result = await beforeAgentStartHandlers[0](
			{ type: "before_agent_start", prompt: "hello", systemPrompt: "BASE" },
			{ cwd: process.cwd() },
		);

		expect(result.message).toBeUndefined();
		expect(result.systemPrompt).toContain("BASE");
		expect(result.systemPrompt).toContain("[DAEDALUS]");
		expect(result.systemPrompt).toContain("Available specialists:");
		expect(result.systemPrompt).toContain("Use Muse whenever the task needs a plan");
		expect(result.systemPrompt).toContain("Always use Worker for implementation");
	});
});
