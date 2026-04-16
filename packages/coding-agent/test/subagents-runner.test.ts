import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type SubagentDefinition, SubagentRegistry, SubagentRunner } from "../src/core/subagents/index.js";

const worker: SubagentDefinition = {
	name: "worker",
	description: "worker",
	systemPrompt: "You implement code.",
	source: "bundled",
};

describe("SubagentRunner", () => {
	const tempRoots: string[] = [];

	afterEach(() => {
		for (const dir of tempRoots.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writes child sessions under the parent artifact dir and returns submitted data", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-subagent-runner-"));
		tempRoots.push(root);
		const parentSessionFile = path.join(root, "parent.jsonl");

		const createSession = vi.fn(async (options: any) => {
			return {
				prompt: async () => {
					options.onSubmit({ summary: "changed auth flow", data: { changedFiles: ["src/auth.ts"] } });
				},
				waitForIdle: async () => {},
				abort: async () => {},
				dispose: () => {},
			};
		});

		const runner = new SubagentRunner({ createSession, registry: new SubagentRegistry() });
		const result = await runner.run({
			parentSessionFile,
			agent: worker,
			goal: "Fix auth",
			assignment: "Edit src/auth.ts to normalize headers.",
		});

		expect(result.status).toBe("completed");
		expect(result.childSessionFile).toBe(path.join(root, "parent", "subagents", `${result.runId}.jsonl`));
		expect(result.data).toEqual({ changedFiles: ["src/auth.ts"] });
	});

	it("spills oversized packet context into a markdown artifact", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-subagent-context-"));
		tempRoots.push(root);
		const parentSessionFile = path.join(root, "parent.jsonl");

		const runner = new SubagentRunner({
			createSession: async (options: any) => ({
				prompt: async () => options.onSubmit({ summary: "done" }),
				waitForIdle: async () => {},
				abort: async () => {},
				dispose: () => {},
			}),
			registry: new SubagentRegistry(),
		});

		const result = await runner.run({
			parentSessionFile,
			agent: worker,
			goal: "Plan auth",
			assignment: "Read the packet and reply.",
			context: "x".repeat(20_000),
		});

		expect(result.contextArtifactPath?.endsWith(".context.md")).toBe(true);
		expect(fs.existsSync(result.contextArtifactPath!)).toBe(true);
	});
});
