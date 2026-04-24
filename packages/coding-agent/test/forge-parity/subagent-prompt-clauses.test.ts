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
			"When launching multiple independent tasks, call subagent once per independent task in parallel (single assistant message, multiple tool calls).",
		);
		expect(tool.promptGuidelines).toContain(
			"Keep Daedalus summary-first result semantics: inspect the returned summary/reference first and read deferred full output only when needed.",
		);
	});
});
