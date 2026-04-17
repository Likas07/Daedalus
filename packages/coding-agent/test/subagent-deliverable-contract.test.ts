import { describe, expect, it } from "vitest";
import { createSubmitResultTool } from "../src/core/subagents/submit-result-tool.js";

describe("submit_result deliverable contract", () => {
	it("accepts deliverable alongside summary", async () => {
		let payload: any;
		const tool = createSubmitResultTool((value) => {
			payload = value;
		});

		await tool.execute("tool-1", {
			summary: "Drafted a short introduction",
			deliverable: "I am Hephaestus, a focused implementation specialist.",
		});

		expect(payload).toEqual({
			summary: "Drafted a short introduction",
			deliverable: "I am Hephaestus, a focused implementation specialist.",
			error: undefined,
			data: undefined,
		});
	});
});
