import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { loadExtensions } from "../src/core/extensions/loader.js";
import { ExtensionRunner } from "../src/core/extensions/runner.js";
import type { ExtensionActions, ExtensionContextActions } from "../src/core/extensions/types.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";

describe("subagent extension API", () => {
	let tempDir: string;
	let extensionsDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-subagent-api-"));
		extensionsDir = path.join(tempDir, "extensions");
		fs.mkdirSync(extensionsDir);
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("exposes pi.runSubagent and listing helpers to extension commands", async () => {
		const extensionPath = path.join(extensionsDir, "subagent-api.ts");
		fs.writeFileSync(
			extensionPath,
			`
        export default function(pi) {
          pi.registerCommand("spawn-one", {
            description: "spawn test subagent",
            handler: async (_args, ctx) => {
              const active = pi.getActiveSubagentRuns();
              if (active.length !== 0) throw new Error("expected empty registry before run");
              const result = await pi.runSubagent({
                agent: { name: "sage", description: "sage", systemPrompt: "Find files", source: "bundled" },
                parentSessionFile: "/tmp/parent.jsonl",
                goal: "Locate auth",
                assignment: "Search the repo",
              });
              const persisted = await pi.listSubagentRuns();
              ctx.ui.notify(result.summary + " / " + persisted.length, "info");
            },
          });
        }
      `,
		);

		const loaded = await loadExtensions([extensionPath], tempDir);
		const runner = new ExtensionRunner(
			loaded.extensions,
			loaded.runtime,
			tempDir,
			SessionManager.inMemory(),
			ModelRegistry.create(AuthStorage.create(path.join(tempDir, "auth.json"))),
		);

		const runSubagent = vi.fn(async () => ({
			runId: "run-1",
			resultId: "run-1",
			agent: "sage",
			status: "completed" as const,
			summary: "Found auth files",
			task: "Locate auth",
			conversationId: "/tmp/parent/subagents/run-1.jsonl",
			output: "src/auth.ts\nsrc/tokens.ts",
			reference: {
				resultId: "run-1",
				agentId: "sage",
				conversationId: "/tmp/parent/subagents/run-1.jsonl",
				task: "Locate auth",
				status: "completed",
				summary: "Found auth files",
				note: "If you want the full output, use read_agent_result_output(run-1).",
			},
			childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
		}));

		const actions: ExtensionActions = {
			sendMessage: () => {},
			sendUserMessage: () => {},
			appendEntry: () => {},
			setSessionName: () => {},
			getSessionName: () => undefined,
			setLabel: () => {},
			getActiveTools: () => [],
			getAllTools: () => [],
			setActiveTools: () => {},
			refreshTools: () => {},
			getCommands: () => [],
			setModel: async () => false,
			getThinkingLevel: () => "off",
			setThinkingLevel: () => {},
			runSubagent,
			getActiveSubagentRuns: () => [],
			listSubagentRuns: async () => [
				{
					runId: "run-1",
					resultId: "run-1",
					agent: "sage",
					status: "completed" as const,
					summary: "Found auth files",
					task: "Locate auth",
					conversationId: "/tmp/parent/subagents/run-1.jsonl",
					output: "src/auth.ts\nsrc/tokens.ts",
					reference: {
						resultId: "run-1",
						agentId: "sage",
						conversationId: "/tmp/parent/subagents/run-1.jsonl",
						task: "Locate auth",
						status: "completed",
						summary: "Found auth files",
						note: "If you want the full output, use read_agent_result_output(run-1).",
					},
					childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
				},
			],
		};

		const ctxActions: ExtensionContextActions = {
			getModel: () => undefined,
			isIdle: () => true,
			getSignal: () => undefined,
			abort: () => {},
			hasPendingMessages: () => false,
			shutdown: () => {},
			getContextUsage: () => undefined,
			compact: () => {},
			getSystemPrompt: () => "",
			getSkills: () => [],
		};

		runner.bindCore(actions, ctxActions, {
			registerProvider: () => {},
			unregisterProvider: () => {},
		});

		const command = runner.getCommand("spawn-one");
		expect(command).toBeDefined();
		await command!.handler("", runner.createCommandContext());
		expect(runSubagent).toHaveBeenCalledOnce();
	});

	it("exposes task launch and lookup helpers to extension commands", async () => {
		const extensionPath = path.join(extensionsDir, "subagent-task-api.ts");
		fs.writeFileSync(
			extensionPath,
			`
        export default function(pi) {
          pi.registerCommand("launch-task", {
            description: "launch test subagent task",
            handler: async (_args, ctx) => {
              const task = await pi.launchSubagentTask({
                agent: { name: "explore", description: "explore", systemPrompt: "Map files", source: "bundled" },
                parentSessionFile: "/tmp/parent.jsonl",
                goal: "Map repo",
                assignment: "Inspect file layout",
                executionMode: "background",
              });
              const current = pi.getSubagentTask(task.id);
              const history = await pi.listSubagentTaskHistory();
              ctx.ui.notify([task.status, current?.status, history.length].join("/"), "info");
            },
          });
        }
      `,
		);

		const loaded = await loadExtensions([extensionPath], tempDir);
		const runner = new ExtensionRunner(
			loaded.extensions,
			loaded.runtime,
			tempDir,
			SessionManager.inMemory(),
			ModelRegistry.create(AuthStorage.create(path.join(tempDir, "auth.json"))),
		);

		const actions: ExtensionActions = {
			sendMessage: () => {},
			sendUserMessage: () => {},
			appendEntry: () => {},
			setSessionName: () => {},
			getSessionName: () => undefined,
			setLabel: () => {},
			getActiveTools: () => [],
			getAllTools: () => [],
			setActiveTools: () => {},
			refreshTools: () => {},
			getCommands: () => [],
			setModel: async () => false,
			getThinkingLevel: () => "off",
			setThinkingLevel: () => {},
			runSubagent: vi.fn(async () => ({
				runId: "run-1",
				agent: "explore",
				status: "completed" as const,
				summary: "done",
				childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
			})),
			getActiveSubagentRuns: () => [],
			listSubagentRuns: async () => [],
			launchSubagentTask: vi.fn(async () => ({ id: "task-1", status: "queued" as const })),
			getSubagentTask: vi.fn(() => ({
				id: "task-1",
				status: "completed" as const,
				summary: "Mapped repo",
			})),
			listSubagentTaskHistory: vi.fn(async () => []),
		} as any;

		const ctxActions: ExtensionContextActions = {
			getModel: () => undefined,
			isIdle: () => true,
			getSignal: () => undefined,
			abort: () => {},
			hasPendingMessages: () => false,
			shutdown: () => {},
			getContextUsage: () => undefined,
			compact: () => {},
			getSystemPrompt: () => "",
			getSkills: () => [],
		};

		runner.bindCore(actions, ctxActions, {
			registerProvider: () => {},
			unregisterProvider: () => {},
		});

		const command = runner.getCommand("launch-task");
		expect(command).toBeDefined();
		await command!.handler("", runner.createCommandContext());
		expect(actions.launchSubagentTask).toHaveBeenCalledOnce();
		expect(actions.getSubagentTask).toHaveBeenCalledWith("task-1");
	});
});
