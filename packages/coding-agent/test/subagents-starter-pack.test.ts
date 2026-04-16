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

describe("starter-pack subagent extension", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-subagent-pack-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("registers the subagent tool plus /orchestrator, /agents, and /subagents", async () => {
		const extensionPath = path.resolve("packages/coding-agent/src/extensions/daedalus/workflow/subagents/index.ts");
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
				agent: "scout",
				status: "completed" as const,
				summary: "Found auth files",
				childSessionFile: "/tmp/parent/subagents/run-1.jsonl",
			})),
			getActiveSubagentRuns: () => [],
			listSubagentRuns: async () => [],
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

		const tools = runner.getAllRegisteredTools();
		const commands = runner
			.getRegisteredCommands()
			.map((command) => command.invocationName)
			.sort();

		expect(tools.some((tool) => tool.definition.name === "subagent")).toBe(true);
		expect(commands).toContain("agents");
		expect(commands).toContain("orchestrator");
		expect(commands).toContain("subagents");
	});
});
