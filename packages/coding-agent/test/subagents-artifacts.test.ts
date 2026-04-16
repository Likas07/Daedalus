import { describe, expect, it } from "vitest";
import { getSubagentArtifactPaths, SubagentRegistry, shouldSpillSubagentContext } from "../src/core/subagents/index.js";

describe("getSubagentArtifactPaths", () => {
	it("stores child files under the parent session artifact directory", () => {
		const paths = getSubagentArtifactPaths("/tmp/sessions/demo.jsonl", "run-001");

		expect(paths.directory).toBe("/tmp/sessions/demo/subagents");
		expect(paths.sessionFile).toBe("/tmp/sessions/demo/subagents/run-001.jsonl");
		expect(paths.resultFile).toBe("/tmp/sessions/demo/subagents/run-001.result.json");
		expect(paths.contextFile).toBe("/tmp/sessions/demo/subagents/run-001.context.md");
		expect(paths.metaFile).toBe("/tmp/sessions/demo/subagents/run-001.meta.json");
	});
});

describe("shouldSpillSubagentContext", () => {
	it("spills packet context after the 12 KB threshold", () => {
		expect(shouldSpillSubagentContext("x".repeat(12_000))).toBe(false);
		expect(shouldSpillSubagentContext("x".repeat(12_001))).toBe(true);
	});
});

describe("SubagentRegistry", () => {
	it("returns active runs in insertion order and updates statuses in place", () => {
		const registry = new SubagentRegistry();

		registry.start({ runId: "run-1", agent: "scout", summary: "Locate auth", parentSessionFile: "/tmp/a.jsonl" });
		registry.start({ runId: "run-2", agent: "planner", summary: "Draft plan", parentSessionFile: "/tmp/a.jsonl" });
		registry.finish("run-1", { status: "completed", summary: "Found 3 files" });

		expect(registry.getActiveRuns().map((run) => run.runId)).toEqual(["run-2"]);
		expect(registry.getRun("run-1")?.status).toBe("completed");
		expect(registry.getRun("run-1")?.summary).toBe("Found 3 files");
	});
});
