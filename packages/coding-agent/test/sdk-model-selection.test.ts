import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Api, Model } from "@oh-my-pi/pi-ai";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { createAgentSession, type ExtensionFactory } from "@oh-my-pi/pi-coding-agent/sdk";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { Snowflake } from "@oh-my-pi/pi-utils";

describe("createAgentSession deferred model pattern resolution", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = path.join(os.tmpdir(), `pi-sdk-model-selection-${Snowflake.next()}`);
		fs.mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	const providerExtension: ExtensionFactory = pi => {
		pi.registerProvider("runtime-provider", {
			baseUrl: "https://runtime.example.com/v1",
			apiKey: "RUNTIME_KEY",
			api: "openai-completions",
			models: [
				{
					id: "runtime-model",
					name: "Runtime Model",
					reasoning: false,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 128000,
					maxTokens: 8192,
				},
				{
					id: "runtime-reasoning-model",
					name: "Runtime Reasoning Model",
					reasoning: true,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 128000,
					maxTokens: 8192,
				},
			],
		});
	};

	function buildMockModelRegistry(models: Model<Api>[]) {
		return {
			getAvailable: () => models,
			getAll: () => models,
			find: (provider: string, id: string) => models.find(model => model.provider === provider && model.id === id),
			getApiKey: async () => "TEST_KEY",
			getApiKeyForProvider: async () => "TEST_KEY",
			refreshInBackground: () => {},
			refresh: async () => {},
			syncExtensionSources: () => {},
			clearSourceRegistrations: () => {},
			registerProvider: () => {},
		};
	}

	function buildSessionOptions(modelPattern: string) {
		return {
			cwd: tempDir,
			agentDir: tempDir,
			sessionManager: SessionManager.inMemory(),
			disableExtensionDiscovery: true,
			extensions: [providerExtension],
			skills: [],
			contextFiles: [],
			promptTemplates: [],
			slashCommands: [],
			enableMCP: false,
			enableLsp: false,
			modelPattern,
		};
	}

	test("resolves explicit modelPattern after extension providers register", async () => {
		const { session, modelFallbackMessage } = await createAgentSession(
			buildSessionOptions("runtime-provider/runtime-model"),
		);

		expect(session.model).toBeDefined();
		expect(session.model?.provider).toBe("runtime-provider");
		expect(session.model?.id).toBe("runtime-model");
		expect(modelFallbackMessage).toBeUndefined();
	});

	test("does not silently fallback when explicit modelPattern is unresolved", async () => {
		const { session, modelFallbackMessage } = await createAgentSession(
			buildSessionOptions("missing-provider/missing-model"),
		);

		expect(session.model).toBeUndefined();
		expect(modelFallbackMessage).toBe('Model "missing-provider/missing-model" not found');
	});

	test("uses the default role for direct user sessions", async () => {
		const settings = Settings.isolated({ defaultThinkingLevel: "off" });
		settings.setModelRole("default", "runtime-provider/runtime-model");
		settings.setModelRole("smol", "runtime-provider/runtime-reasoning-model");
		settings.setModelRole("task", "runtime-provider/runtime-reasoning-model");
		const modelRegistry = buildMockModelRegistry([
			{
				id: "runtime-model",
				name: "Runtime Model",
				api: "openai-completions",
				provider: "runtime-provider",
				baseUrl: "https://runtime.example.com/v1",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
			{
				id: "runtime-reasoning-model",
				name: "Runtime Reasoning Model",
				api: "openai-completions",
				provider: "runtime-provider",
				baseUrl: "https://runtime.example.com/v1",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
		]);

		for (const requestSource of [undefined, "cli"] as const) {
			const { session } = await createAgentSession({
				cwd: tempDir,
				agentDir: tempDir,
				sessionManager: SessionManager.inMemory(),
				disableExtensionDiscovery: true,
				extensions: [],
				skills: [],
				contextFiles: [],
				promptTemplates: [],
				slashCommands: [],
				enableMCP: false,
				enableLsp: false,
				settings,
				modelRegistry: modelRegistry as never,
				requestSource,
			});

			expect(session.model?.provider).toBe("runtime-provider");
			expect(session.model?.id).toBe("runtime-model");
			expect(session.resolutionTrace?.role).toBe("default");
		}
	});

	test("keeps delegated subagent routing on task-oriented roles", async () => {
		const settings = Settings.isolated({ defaultThinkingLevel: "off" });
		settings.setModelRole("default", "runtime-provider/runtime-model");
		settings.setModelRole("smol", "runtime-provider/runtime-model");
		settings.setModelRole("task", "runtime-provider/runtime-reasoning-model");
		const modelRegistry = buildMockModelRegistry([
			{
				id: "runtime-model",
				name: "Runtime Model",
				api: "openai-completions",
				provider: "runtime-provider",
				baseUrl: "https://runtime.example.com/v1",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
			{
				id: "runtime-reasoning-model",
				name: "Runtime Reasoning Model",
				api: "openai-completions",
				provider: "runtime-provider",
				baseUrl: "https://runtime.example.com/v1",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
		]);

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir: tempDir,
			sessionManager: SessionManager.inMemory(),
			disableExtensionDiscovery: true,
			extensions: [],
			skills: [],
			contextFiles: [],
			promptTemplates: [],
			slashCommands: [],
			enableMCP: false,
			enableLsp: false,
			settings,
			modelRegistry: modelRegistry as never,
			requestSource: "subagent",
			taskDepth: 1,
			requireSubmitResultTool: true,
		});

		expect(session.model?.provider).toBe("runtime-provider");
		expect(session.model?.id).toBe("runtime-reasoning-model");
		expect(session.resolutionTrace?.role).toBe("task");
	});

	test("does not apply default role thinking override when modelPattern is explicit", async () => {
		const settings = Settings.isolated({ defaultThinkingLevel: "off" });
		settings.setModelRole("smol", "runtime-provider/runtime-reasoning-model");
		settings.setModelRole("default", "pi/smol:high");

		const { session } = await createAgentSession({
			...buildSessionOptions("runtime-provider/runtime-reasoning-model"),
			settings,
		});

		expect(session.model?.provider).toBe("runtime-provider");
		expect(session.model?.id).toBe("runtime-reasoning-model");
		expect(session.thinkingLevel).toBe("off");
	});

});
