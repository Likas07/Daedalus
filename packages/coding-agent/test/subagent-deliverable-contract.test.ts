import { describe, expect, it } from "vitest";
import { createSubmitResultTool } from "../src/core/subagents/submit-result-tool.js";

describe("submit_result deliverable contract", () => {
	it("accepts the universal subagent result envelope", async () => {
		let payload: any;
		const tool = createSubmitResultTool((value) => {
			payload = value;
		});

		await tool.execute("tool-1", {
			task: "Inspect auth flow",
			status: "completed",
			summary: "Mapped the authentication entrypoints.",
			output: "Auth enters through src/auth.ts and normalizes headers before token verification.",
		});

		expect(payload).toEqual({
			task: "Inspect auth flow",
			status: "completed",
			summary: "Mapped the authentication entrypoints.",
			output: "Auth enters through src/auth.ts and normalizes headers before token verification.",
		});
	});
});
