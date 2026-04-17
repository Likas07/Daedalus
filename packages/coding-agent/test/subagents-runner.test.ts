import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTaskPacket, type SubagentDefinition, SubagentRegistry, SubagentRunner } from "../src/core/subagents/index.js";

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

	it("reports agent-specific progress while the child session is running", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-subagent-progress-"));
		tempRoots.push(root);
		const parentSessionFile = path.join(root, "parent.jsonl");
		const updates: Array<{ agent: string; activity?: string; recentActivity?: string[] }> = [];

		const runner = new SubagentRunner({
			createSession: async (options: any) => {
				let listener: ((event: any) => void) | undefined;
				return {
					subscribe: (next: (event: any) => void) => {
						listener = next;
						return () => {
							listener = undefined;
						};
					},
					prompt: async () => {
						listener?.({ type: "message_start" });
						listener?.({
							type: "tool_execution_start",
							toolName: "read",
							args: { path: "src/auth.ts" },
						});
						listener?.({
							type: "tool_execution_start",
							toolName: "grep",
							args: { pattern: "Authorization", path: "src" },
						});
						options.onSubmit({ summary: "Mapped auth flow" });
					},
					waitForIdle: async () => {},
					abort: async () => {},
					dispose: () => {},
				};
			},
			registry: new SubagentRegistry(),
		});

		const result = await runner.run({
			parentSessionFile,
			agent: { ...worker, name: "scout" },
			goal: "Trace auth flow",
			assignment: "Inspect the auth entrypoints and summarize them.",
			onProgress: (progress) => {
				updates.push({
					agent: progress.agent,
					activity: progress.activity,
					recentActivity: progress.recentActivity,
				});
			},
		});

		expect(result.status).toBe("completed");
		expect(updates[0]?.agent).toBe("scout");
		expect(updates.some((update) => update.activity?.includes("read src/auth.ts"))).toBe(true);
		expect(updates.some((update) => update.activity?.includes("grep /Authorization/ in src"))).toBe(true);
		expect(updates.at(-1)?.recentActivity).toContain("read src/auth.ts");
		expect(updates.at(-1)?.recentActivity).toContain("grep /Authorization/ in src");
	});

	it("sends reminder prompts before failing when the child exits without submit_result", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-subagent-reminders-"));
		tempRoots.push(root);
		const parentSessionFile = path.join(root, "parent.jsonl");
		const prompts: string[] = [];

		const runner = new SubagentRunner({
			registry: new SubagentRegistry(),
			createSession: async () => ({
				prompt: async (text: string) => {
					prompts.push(text);
				},
				waitForIdle: async () => {},
				abort: async () => {},
				dispose: () => {},
			}),
		});

		const result = await runner.run({
			agent: worker,
			parentSessionFile,
			goal: "Fix auth",
			assignment: "Edit src/auth.ts",
		});

		expect(result.status).toBe("failed");
		expect(prompts.length).toBeGreaterThan(1);
		expect(prompts.at(-1)).toContain("submit_result");
	});

	it("fails the run when structured output does not match the schema", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-subagent-schema-"));
		tempRoots.push(root);
		const parentSessionFile = path.join(root, "parent.jsonl");

		const runner = new SubagentRunner({
			registry: new SubagentRegistry(),
			createSession: async (options: any) => ({
				prompt: async () => {
					options.onSubmit({ summary: "Done", data: { changedFiles: "src/auth.ts" } });
				},
				waitForIdle: async () => {},
				abort: async () => {},
				dispose: () => {},
			}),
		});

		const result = await runner.run({
			agent: worker,
			parentSessionFile,
			goal: "Fix auth",
			assignment: "Edit src/auth.ts",
			outputSchema: {
				type: "object",
				properties: {
					changedFiles: { type: "array", items: { type: "string" } },
				},
				required: ["changedFiles"],
			},
		});

		expect(result.status).toBe("failed");
		expect(result.summary).toContain("invalid structured output");
		expect(result.error).toContain("changedFiles");
		expect(result.resultArtifactPath).toBeUndefined();
	});

	it("rejects runs deeper than maxDepth", async () => {
		const runner = new SubagentRunner({
			createSession: async () => {
				throw new Error("should not create");
			},
			registry: new SubagentRegistry(),
			maxConcurrency: 4,
			maxDepth: 2,
		});

		await expect(
			runner.run({
				agent: { ...worker },
				parentSessionFile: "/tmp/parent.jsonl",
				goal: "Nested work",
				assignment: "Do work",
				metadata: { depth: 3, parentAgent: "planner" },
			}),
		).rejects.toThrow("maxDepth");
	});

	it("rejects runs when maxConcurrency is already reached", async () => {
		const registry = new SubagentRegistry();
		registry.start({
			runId: "run-1",
			agent: "scout",
			summary: "Trace auth",
			parentSessionFile: "/tmp/parent.jsonl",
		});
		const runner = new SubagentRunner({
			createSession: async () => {
				throw new Error("should not create");
			},
			registry,
			maxConcurrency: 1,
			maxDepth: 2,
		});

		await expect(
			runner.run({
				agent: worker,
				parentSessionFile: "/tmp/parent.jsonl",
				goal: "Parallel work",
				assignment: "Do work",
			}),
		).rejects.toThrow("maxConcurrency");
	});

	it("builds a compact packet with spillover context when needed", () => {
		const longContext = "x".repeat(30_000);
		const packet = buildTaskPacket({
			goal: "Map auth flow",
			assignment: "Inspect the authentication entrypoints.",
			context: longContext,
		});

		expect(packet.contextToPersist).toBe(longContext);
		expect(packet.packetText).toContain("Context file: {contextArtifactPath}");
	});

	it("returns deliverable content separately from summary", async () => {
		const registry = new SubagentRegistry();
		const runner = new SubagentRunner({
			registry,
			createSession: async (options: any) => ({
				prompt: async () =>
					options.onSubmit({
						summary: "Drafted a short introduction",
						deliverable: "I am Hephaestus, a focused implementation specialist.",
					}),
				waitForIdle: async () => {},
				abort: async () => {},
				dispose: () => {},
			}),
		});

		const result = await runner.run({
			parentSessionFile: "/tmp/parent.jsonl",
			agent: { name: "worker", description: "worker", systemPrompt: "Work.", source: "bundled" },
			goal: "Write an introduction",
			assignment: "Write a short first-person introduction.",
		});

		expect(result.summary).toBe("Drafted a short introduction");
		expect(result.deliverable).toBe("I am Hephaestus, a focused implementation specialist.");
	});
});
