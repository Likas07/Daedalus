import { describe, expect, it } from "vitest";
import { validateSubagentResult } from "../src/core/subagents/result-validation.js";

describe("validateSubagentResult", () => {
	it("returns an error when structured output does not match schema", () => {
		const error = validateSubagentResult(
			{ changedFiles: "src/auth.ts" },
			{
				type: "object",
				properties: {
					changedFiles: { type: "array", items: { type: "string" } },
				},
				required: ["changedFiles"],
			},
		);

		expect(error).toContain("changedFiles");
	});
});
