import { describe, expect, it } from "vitest";
import todoExtension from "../../src/extensions/daedalus/tools/todo.js";

function getRegisteredTool(name: string) {
	const tools: any[] = [];
	todoExtension({
		registerTool(tool: any) {
			tools.push(tool);
		},
		registerCommand() {},
		registerMessageRenderer() {},
		on() {},
	} as any);
	return tools.find((tool) => tool.name === name);
}

describe("todo_write prompt doctrine", () => {
	it("includes Forge parity todo discipline clauses", () => {
		const tool = getRegisteredTool("todo_write");
		expect(tool.promptGuidelines).toContain("Use todo_write frequently to plan and track multi-step tasks.");
		expect(tool.promptGuidelines).toContain(
			"Mark todos complete ONLY after actually executing the implementation AND verifying it works.",
		);
		expect(tool.promptGuidelines).toContain("Do not batch multiple completed tasks; mark as you go.");
	});
});
