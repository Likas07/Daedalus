import { describe, expect, it } from "vitest";
import semSearchExtension from "../../src/extensions/daedalus/tools/sem-search.js";

function getRegisteredTool() {
	const tools: any[] = [];
	semSearchExtension({
		registerTool(tool: any) {
			tools.push(tool);
		},
	} as any);
	return tools.find((tool) => tool.name === "sem_search");
}

describe("sem_search prompt doctrine", () => {
	it("includes Forge parity semantic-search clauses", () => {
		const tool = getRegisteredTool();
		expect(tool.promptGuidelines).toContain(
			"Semantic search is the default tool for discovering code locations when you don't know exact identifiers or file names.",
		);
		expect(tool.promptGuidelines).toContain(
			"Use 2–3 varied queries with distinct use_case descriptions for best results.",
		);
		expect(tool.promptGuidelines).toContain(
			"Split the embedding query (what to find) from the use_case (why) — reranking uses the use_case.",
		);
	});
});
