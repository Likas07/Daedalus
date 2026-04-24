import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import { buildSubagentAppendPrompts } from "../src/core/subagents/runtime-config.js";
import { getBundledStarterAgents } from "../src/extensions/daedalus/workflow/subagents/bundled.js";

function _getTextContent(message: any): string {
	if (!Array.isArray(message?.content)) return "";
	return message.content
		.filter((block: any) => block.type === "text")
		.map((block: any) => block.text)
		.join("\n");
}

describe("primary role runtime mode", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-primary-role-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	it("switches to Sage primary mode with read-only analysis doctrine and restricted tools", async () => {
		const faux = registerFauxProvider();
		let providerSystemPrompt = "";
		faux.setResponses([
			(context) => {
				providerSystemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("sage primary ok");
			},
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: faux.getModel(),
			authStorage,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		await session.prompt("/role sage");
		expect(session.getActiveToolNames()).toEqual(expect.arrayContaining(["fs_search", "todo_read"]));
		expect(session.getActiveToolNames()).not.toContain("sem_search");
		expect(session.getActiveToolNames()).not.toContain("write");
		expect(session.getActiveToolNames()).not.toContain("hashline_edit");

		await session.prompt("Explain the auth architecture");
		expect(providerSystemPrompt).toContain("[PRIMARY ROLE MODE: SAGE]");
		expect(providerSystemPrompt).toContain("You are Sage");
		expect(providerSystemPrompt).toContain("You are not a delegated subagent in this mode");
		expect(providerSystemPrompt).not.toContain("submit_result exactly once");

		session.dispose();
		faux.unregister();
	});

	it("switches to Muse primary mode with planning doctrine and execute_plan-capable toolset", async () => {
		const faux = registerFauxProvider();
		let providerSystemPrompt = "";
		faux.setResponses([
			(context) => {
				providerSystemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("muse primary ok");
			},
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: faux.getModel(),
			authStorage,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		await session.prompt("/role muse");
		expect(session.getActiveToolNames()).toEqual(expect.arrayContaining(["todo_write", "execute_plan", "subagent"]));

		await session.prompt("Plan the auth refactor");
		expect(providerSystemPrompt).toContain("[PRIMARY ROLE MODE: MUSE]");
		expect(providerSystemPrompt).toContain("You are Muse");
		expect(providerSystemPrompt).toContain("You may consult Sage through subagent delegation");
		expect(providerSystemPrompt).not.toContain("submit_result exactly once");

		session.dispose();
		faux.unregister();
	});

	it("restores the selected primary role mode on session resume", async () => {
		const faux = registerFauxProvider();
		let providerSystemPrompt = "";
		faux.setResponses([
			(context) => {
				providerSystemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("resumed sage ok");
			},
		]);
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		sessionManager.appendCustomEntry("primary-role-mode", {
			role: "sage",
			baselineTools: ["read", "bash", "hashline_edit", "write"],
		});
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: faux.getModel(),
			authStorage,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		expect(session.getActiveToolNames()).toEqual(expect.arrayContaining(["todo_read"]));
		expect(session.getActiveToolNames()).not.toContain("sem_search");
		expect(session.getActiveToolNames()).not.toContain("write");

		await session.prompt("Resume the architecture analysis");
		expect(providerSystemPrompt).toContain("[PRIMARY ROLE MODE: SAGE]");

		session.dispose();
		faux.unregister();
	});

	it("keeps delegated Sage prompts on the subagent result contract while primary Sage does not use it", () => {
		const sage = getBundledStarterAgents().find((agent) => agent.name === "sage");
		expect(sage).toBeDefined();
		const delegated = buildSubagentAppendPrompts({ agent: sage!, packetText: "Goal: inspect auth" }).join("\n\n");
		expect(delegated).toContain("submit_result exactly once");
		expect(delegated).toContain("Delegated task packet:");
		expect(sage?.systemPrompt).toContain("When delegated, gather the minimum sufficient evidence");
	});
});
