import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SubagentRunner } from "./runner.js";
import type { SubagentDefinition } from "./types.js";

const agent: SubagentDefinition = {
	name: "worker",
	description: "Worker",
	systemPrompt: "work",
	source: "bundled",
	toolPolicy: { allowedTools: ["read"], writableGlobs: [], spawns: [] },
};

describe("SubagentRunner", () => {
	test("returns submitted result envelope", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "daedalus-runner-"));
		const runner = new SubagentRunner({
			cwd,
			createSession: async (options) => {
				options.onSubmit({ task: "task", status: "completed", summary: "done", output: "output" });
				return { prompt: async () => {}, waitForIdle: async () => {}, abort: async () => {}, dispose: () => {} };
			},
		});

		const result = await runner.run({
			agent,
			parentSessionFile: join(cwd, "parent.jsonl"),
			goal: "goal",
			assignment: "assignment",
		});
		expect(result.status).toBe("completed");
		expect(result.summary).toBe("done");
		expect(result.output).toBe("output");
	});
});
