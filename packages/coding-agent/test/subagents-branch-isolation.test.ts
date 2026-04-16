import { describe, expect, it } from "vitest";
import { buildChildBranchName } from "../src/core/subagents/branch-isolation.js";

describe("branch isolation", () => {
	it("builds deterministic child branch names", () => {
		expect(
			buildChildBranchName({
				parentBranch: "main",
				agent: "worker",
				runId: "abcd1234",
				template: "subagent/{parentBranch}/{agent}/{runId}",
			}),
		).toBe("subagent/main/worker/abcd1234");
	});
});
