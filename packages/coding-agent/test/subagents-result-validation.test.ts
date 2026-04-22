import { describe, expect, it } from "vitest";
import { validateSubagentEnvelope, validateSubagentResult } from "../src/core/subagents/result-validation.js";

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

describe("validateSubagentEnvelope", () => {
	it("accepts the universal result envelope", () => {
		const error = validateSubagentEnvelope({
			task: "Inspect auth flow",
			status: "completed",
			summary: "Mapped auth flow",
			output: "Auth enters through src/auth.ts.",
		});

		expect(error).toBeUndefined();
	});

	it("rejects envelopes missing required fields", () => {
		const error = validateSubagentEnvelope({
			status: "completed",
			summary: "Mapped auth flow",
			output: "Auth enters through src/auth.ts.",
		});

		expect(error).toContain("task");
	});
});
