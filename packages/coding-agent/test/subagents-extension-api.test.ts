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
                agent: { name: "scout", description: "scout", systemPrompt: "Find files", source: "bundled" },
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
			agent: "scout",
			status: "completed" as const,
			summary: "Found auth files",
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
					agent: "scout",
					status: "completed" as const,
					summary: "Found auth files",
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
});
