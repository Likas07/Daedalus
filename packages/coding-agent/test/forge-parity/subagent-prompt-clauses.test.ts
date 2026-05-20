import { describe, expect, it } from "vitest";
import subagentStarterPack from "../../src/extensions/daedalus/workflow/subagents/index.js";

function getRegisteredTool(overrides: Record<string, any> = {}) {
	const tools: any[] = [];
	subagentStarterPack({
		registerTool(tool: any) {
			tools.push(tool);
		},
		registerCommand() {},
		on() {},
		...overrides,
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

	it("documents current subagent isolation and artifact-first self-merge contract", () => {
		const tool = getRegisteredTool();
		const guidance = tool.promptGuidelines.join("\n");

		expect(guidance).toContain("Use isolated:true for implementation, risky edits, or parallel mutations");
		expect(guidance).toContain("Isolated subagents self-merge through the runner");
		expect(guidance).toContain("artifact-first summary/reference metadata");
		expect(guidance).toContain("instead of attempting parent-side WorkspaceTarget merges");

		const parameterSchema = JSON.stringify(tool.parameters);
		expect(parameterSchema).toContain("isolated");
		expect(tool.parameters.properties.isolated).toMatchObject({ type: "boolean" });
		expect(tool.parameters.properties.isolated.description).toContain("managed isolated workspace");

		expect(parameterSchema).not.toContain("base_branch");
		expect(parameterSchema).not.toContain("merge_back");
		expect(parameterSchema).not.toContain("inherit");
		expect(parameterSchema).not.toContain("shared");
		expect(parameterSchema).not.toContain("worktree");
	});

	it("documents taskBinding with an explicit enum and example", () => {
		const tool = getRegisteredTool();
		const taskBinding = tool.parameters.properties.taskBinding;
		const taskBindingProperties = taskBinding.properties;
		const guidance = tool.promptGuidelines.join("\n");

		expect(taskBinding.description).toContain("Executable-plan binding");
		expect(taskBindingProperties.type).toMatchObject({ type: "string", enum: ["plan-task"] });
		expect(taskBindingProperties.type.description).toContain('Must be exactly "plan-task"');
		expect(taskBindingProperties.planPath.description).toContain("Repository-relative path");
		expect(taskBindingProperties.taskId.description).toContain("Stable id");
		expect(taskBindingProperties.taskTitle.description).toContain("Human-readable title");
		expect(taskBindingProperties.files.description).toContain("Repository-relative files");
		expect(guidance).toContain("taskBinding");
		expect(guidance).toContain('{"type":"plan-task"');
		expect(guidance).toContain('"planPath":"docs/plans/2026_05_16/example.plan.json"');
	});

	it("surfaces executable-plan handoff fields in the lightweight subagent result", async () => {
		const tool = getRegisteredTool({
			runSubagent: async () => ({
				runId: "run-1",
				resultId: "result-1",
				agent: "muse",
				status: "completed",
				summary: "Plan ready",
				output: [
					"plan_path: docs/plans/2026_05_16/muse.plan.json",
					"validated: true",
					"recommended_parent_action: run execute_plan(path=docs/plans/2026_05_16/muse.plan.json, resume=true)",
				].join("\n"),
			}),
		});
		const result = await tool.execute(
			"tool-call-1",
			{ agent: "muse", goal: "Plan", assignment: "Create an executable plan" },
			undefined,
			undefined,
			{
				cwd: process.cwd(),
				sessionManager: { getSessionFile: () => "/tmp/parent.jsonl" },
				workspaceTarget: undefined,
			},
		);

		const visible = JSON.parse(result.content[0].text);
		expect(visible.plan_path).toBe("docs/plans/2026_05_16/muse.plan.json");
		expect(visible.validated).toBe(true);
		expect(visible.recommended_parent_action).toContain("execute_plan");
		expect(visible).not.toHaveProperty("output");
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
