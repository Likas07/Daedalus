import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import semanticSearchExtension from "../src/extensions/semantic-search/index.js";

describe("semantic search extension toggle", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-semantic-toggle-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("does not expose semantic search in the default Daedalus bundle", async () => {
		const sessionManager = SessionManager.inMemory();
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		expect(session.getToolDefinition("fs_search")).toBeDefined();
		expect(session.getToolDefinition("sem_search")).toBeUndefined();
		expect(session.getActiveToolNames()).not.toContain("sem_search");
		expect(session.getActiveToolNames()).not.toContain("sem_workspace_init");
		expect(session.systemPrompt).not.toContain("- sem_search:");
		expect(session.systemPrompt).not.toContain("Semantic search is the default tool");

		session.dispose();
	});

	it("does not expose semantic search when a legacy built-in toggle is set", async () => {
		const sessionManager = SessionManager.inMemory();
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		settingsManager.setBuiltinExtensionEnabled("daedalus-semantic-search", true);

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		expect(session.getToolDefinition("fs_search")).toBeDefined();
		expect(session.getToolDefinition("sem_search")).toBeUndefined();
		expect(session.getActiveToolNames()).not.toContain("sem_search");
		expect(session.systemPrompt).not.toContain("- sem_search:");

		session.dispose();
	});

	it("can still load semantic search as an explicit non-built-in extension factory", async () => {
		const sessionManager = SessionManager.inMemory();
		const settingsManager = SettingsManager.create(tempDir, agentDir);

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
			extensionFactories: [semanticSearchExtension],
		});
		await session.bindExtensions({});

		expect(session.getToolDefinition("fs_search")).toBeDefined();
		expect(session.getToolDefinition("sem_search")).toBeDefined();
		expect(session.getActiveToolNames()).not.toContain("sem_search");
		expect(session.systemPrompt).not.toContain("- sem_search:");

		session.dispose();
	});
});
