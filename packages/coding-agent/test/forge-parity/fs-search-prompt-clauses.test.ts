import { describe, expect, it } from "vitest";
import fsSearchExtension from "../../src/extensions/daedalus/tools/fs-search.js";

function getRegisteredTool() {
	const tools: any[] = [];
	fsSearchExtension({
		registerTool(tool: any) {
			tools.push(tool);
		},
	} as any);
	return tools.find((tool) => tool.name === "fs_search");
}

describe("fs_search prompt doctrine", () => {
	it("distinguishes exact regex search from semantic discovery", () => {
		const tool = getRegisteredTool();
		expect(tool.promptGuidelines).toContain(
			"Regex Search: use fs_search for finding exact strings, symbols, TODOs, or regex patterns when you know what textual shape to match.",
		);
	});
});
