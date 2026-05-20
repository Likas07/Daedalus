import { join } from "node:path";
import { Agent, type AgentMessage, type ThinkingLevel } from "@daedalus-pi/agent-core";
import { type Message, type Model, streamSimple } from "@daedalus-pi/ai";
import { getAgentDir, getDocsPath } from "../config.js";
import daedalusBundle from "../extensions/daedalus/bundle.js";
import { AgentSession } from "./agent-session.js";
import { AuthStorage } from "./auth-storage.js";
import { DEFAULT_THINKING_LEVEL } from "./defaults.js";
import type { ExtensionRunner, LoadExtensionsResult, SessionStartEvent, ToolDefinition } from "./extensions/index.js";
import { convertToLlm } from "./messages.js";
import { ModelRegistry } from "./model-registry.js";
import { findInitialModel } from "./model-resolver.js";
import type { ResourceLoader } from "./resource-loader.js";
import { DefaultResourceLoader } from "./resource-loader.js";
import { getDefaultSessionDir, SessionManager } from "./session-manager.js";
import { SettingsManager } from "./settings-manager.js";
import type { SubagentSessionContext } from "./subagents/types.js";
import { time } from "./timings.js";
import { DEFAULT_ACTIVE_TOOL_NAMES } from "./tools/defaults.js";
import {
	allTools,
	astEditTool,
	astGrepTool,
	bashTool,
	codingTools,
	createAstEditTool,
	createAstGrepTool,
	createBashTool,
	createCodingTools,
	createEditTool,
	createFetchTool,
	createFindTool,
	createGrepTool,
	createHashlineEditTool,
	createLsTool,
	createReadOnlyTools,
	createReadTool,
	createWriteTool,
	editTool,
	fetchTool,
	findTool,
	grepTool,
	hashlineEditTool,
	lsTool,
	readOnlyTools,
	readTool,
	type Tool,
	withFileMutationQueue,
	writeTool,
} from "./tools/index.js";
import { gitWorktreeList } from "./workspaces/git.js";
import type { WorkspaceTarget } from "./workspaces/types.js";
import { WorkspaceService } from "./workspaces/workspace-service.js";

export interface CreateAgentSessionOptions {
	/** Working directory for project-local discovery. Default: process.cwd() */
	cwd?: string;
	/** Explicit workspace target. Its cwd is used as the effective session cwd. */
	workspaceTarget?: WorkspaceTarget;
	/** Global config directory. Default: ~/.daedalus/agent */
	agentDir?: string;

	/** Auth storage for credentials. Default: AuthStorage.create(agentDir/auth.json) */
	authStorage?: AuthStorage;
	/** Model registry. Default: ModelRegistry.create(authStorage, agentDir/models.json) */
	modelRegistry?: ModelRegistry;

	/** Model to use. Default: from settings, else first available */
	model?: Model<any>;
	/** Thinking level. Default: from settings, else 'medium' (clamped to model capabilities) */
	thinkingLevel?: ThinkingLevel;
	/** Whether to request fast/priority execution when supported. Default: false. */
	fastMode?: boolean;
	/** Models available for cycling (Ctrl+P in interactive mode) */
	scopedModels?: Array<{ model: Model<any>; thinkingLevel?: ThinkingLevel }>;

	/** Built-in tools to use. Default: the default active built-in tools (read, bash, hashline_edit, fetch, ast_grep, ast_edit, write, grep, find, ls). */
	tools?: Tool[];
	/** Custom tools to register (in addition to built-in tools). */
	customTools?: ToolDefinition[];

	/** Resource loader. When omitted, DefaultResourceLoader is used. */
	resourceLoader?: ResourceLoader;

	/** Session manager. Default: SessionManager.create(cwd) */
	sessionManager?: SessionManager;

	/** Nested subagent runtime metadata for child sessions. */
	subagentContext?: SubagentSessionContext;
	subagentInteractionBroker?: import("./subagents/interaction-broker.js").SubagentInteractionBroker;

	/** Settings manager. Default: SettingsManager.create(cwd, agentDir) */
	settingsManager?: SettingsManager;
	/** Session start event metadata for extension runtime startup. */
	sessionStartEvent?: SessionStartEvent;
}

/** Result from createAgentSession */
export interface CreateAgentSessionResult {
	/** The created session */
	session: AgentSession;
	/** Extensions result (for UI context setup in interactive mode) */
	extensionsResult: LoadExtensionsResult;
	/** Warning if session was restored with a different model than saved */
	modelFallbackMessage?: string;
}

// Re-exports

export * from "./agent-session-runtime.js";
export type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ExtensionFactory,
	SlashCommandInfo,
	SlashCommandSource,
	ToolDefinition,
} from "./extensions/index.js";
export type { PromptTemplate } from "./prompt-templates.js";
export type { Skill } from "./skills.js";
export * from "./subagents/index.js";
export type { Tool } from "./tools/index.js";
export * from "./workspaces/session-identity.js";
export type * from "./workspaces/types.js";
export { WorkspaceService } from "./workspaces/workspace-service.js";

export function getWorkspaceStatus(cwd = process.cwd(), projectRoot = cwd): WorkspaceTarget {
	return new WorkspaceService({ projectRoot }).resolveCurrentTarget(cwd);
}

export function listWorkspaceTargets(projectRoot = process.cwd()): WorkspaceTarget[] {
	const service = new WorkspaceService({ projectRoot });
	return gitWorktreeList(service.projectRoot).map((entry) => service.openTarget({ cwd: entry.path }));
}

export function createWorkspaceTarget(options: {
	projectRoot?: string;
	branch: string;
	baseRef?: string;
	slug?: string;
	id?: string;
	name?: string;
}): WorkspaceTarget {
	const { projectRoot, ...rest } = options;
	return new WorkspaceService({ projectRoot }).createIsolatedTarget(rest);
}

export function openWorkspaceTarget(options: {
	projectRoot?: string;
	cwd?: string;
	branch?: string;
	id?: string;
}): WorkspaceTarget {
	const { projectRoot, ...rest } = options;
	return new WorkspaceService({ projectRoot }).openTarget(rest);
}

export function getWorkspaceCleanupRisk(target: WorkspaceTarget, projectRoot = target.projectRoot ?? process.cwd()) {
	return new WorkspaceService({ projectRoot }).cleanupTargetRisk(target);
}

export {
	allTools as allBuiltInTools,
	astEditTool,
	astGrepTool,
	bashTool,
	codingTools,
	createAstEditTool,
	createAstGrepTool,
	createBashTool,
	// Tool factories (for custom cwd)
	createCodingTools,
	createEditTool,
	createFetchTool,
	createFindTool,
	createGrepTool,
	createHashlineEditTool,
	createLsTool,
	createReadOnlyTools,
	createReadTool,
	createWriteTool,
	editTool,
	fetchTool,
	findTool,
	grepTool,
	hashlineEditTool,
	lsTool,
	readOnlyTools,
	// Pre-built tools (use process.cwd())
	readTool,
	withFileMutationQueue,
	writeTool,
};

// Helper Functions

function getDefaultAgentDir(): string {
	return getAgentDir();
}

/**
 * Create an AgentSession with the specified options.
 *
 * @example
 * ```typescript
 * // Minimal - uses defaults
 * const { session } = await createAgentSession();
 *
 * // With explicit model
 * import { getModel } from '@daedalus-pi/ai';
 * const { session } = await createAgentSession({
 *   model: getModel('anthropic', 'claude-opus-4-5'),
 *   thinkingLevel: 'high',
 * });
 *
 * // Continue previous session
 * const { session, modelFallbackMessage } = await createAgentSession({
 *   continueSession: true,
 * });
 *
 * // Full control
 * const loader = new DefaultResourceLoader({
 *   cwd: process.cwd(),
 *   agentDir: getAgentDir(),
 *   settingsManager: SettingsManager.create(),
 * });
 * await loader.reload();
 * const { session } = await createAgentSession({
 *   model: myModel,
 *   tools: [readTool, bashTool],
 *   resourceLoader: loader,
 *   sessionManager: SessionManager.inMemory(),
 * });
 * ```
 */
export async function createAgentSession(options: CreateAgentSessionOptions = {}): Promise<CreateAgentSessionResult> {
	const cwd = options.workspaceTarget?.cwd ?? options.cwd ?? process.cwd();
	const agentDir = options.agentDir ?? getDefaultAgentDir();
	let resourceLoader = options.resourceLoader;

	// Use provided or create AuthStorage and ModelRegistry
	const authPath = options.agentDir ? join(agentDir, "auth.json") : undefined;
	const modelsPath = options.agentDir ? join(agentDir, "models.json") : undefined;
	const authStorage = options.authStorage ?? AuthStorage.create(authPath);
	const modelRegistry = options.modelRegistry ?? ModelRegistry.create(authStorage, modelsPath);

	const settingsManager = options.settingsManager ?? SettingsManager.create(cwd, agentDir);
	const sessionManager = options.sessionManager ?? SessionManager.create(cwd, getDefaultSessionDir(cwd, agentDir));
	if (!options.sessionManager && options.workspaceTarget) {
		sessionManager.setWorkspaceIdentity({
			version: 1,
			sessionId: sessionManager.getSessionId(),
			workspace: options.workspaceTarget,
		});
	}

	if (!resourceLoader) {
		resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			extensionFactories: [daedalusBundle],
		});
		await resourceLoader.reload();
		time("resourceLoader.reload");
	}

	// Check if session has existing data to restore
	const existingSession = sessionManager.buildSessionContext();
	const hasExistingSession = existingSession.messages.length > 0;
	const hasThinkingEntry = sessionManager.getBranch().some((entry) => entry.type === "thinking_level_change");
	const hasFastModeEntry = sessionManager.getBranch().some((entry) => entry.type === "fast_mode_change");

	let model = options.model;
	let modelFallbackMessage: string | undefined;

	// If session has data, try to restore model from it
	if (!model && hasExistingSession && existingSession.model) {
		const restoredModel = modelRegistry.find(existingSession.model.provider, existingSession.model.modelId);
		if (restoredModel && modelRegistry.hasConfiguredAuth(restoredModel)) {
			model = restoredModel;
		}
		if (!model) {
			modelFallbackMessage = `Could not restore model ${existingSession.model.provider}/${existingSession.model.modelId}`;
		}
	}

	// If still no model, use findInitialModel (checks settings default, then provider defaults)
	if (!model) {
		const result = await findInitialModel({
			scopedModels: [],
			isContinuing: hasExistingSession,
			defaultProvider: settingsManager.getDefaultProvider(),
			defaultModelId: settingsManager.getDefaultModel(),
			defaultThinkingLevel: settingsManager.getDefaultThinkingLevel(),
			modelRegistry,
		});
		model = result.model;
		if (!model) {
			modelFallbackMessage = `No models available. Use /login or set an API key environment variable. See ${join(getDocsPath(), "providers.md")}. Then use /model to select a model.`;
		} else if (modelFallbackMessage) {
			modelFallbackMessage += `. Using ${model.provider}/${model.id}`;
		}
	}

	let thinkingLevel = options.thinkingLevel;

	// If session has data, restore thinking level from it
	if (thinkingLevel === undefined && hasExistingSession) {
		thinkingLevel = hasThinkingEntry
			? (existingSession.thinkingLevel as ThinkingLevel)
			: (settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL);
	}

	// Fall back to settings default
	if (thinkingLevel === undefined) {
		thinkingLevel = settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;
	}

	// Clamp to model capabilities
	if (!model?.reasoning) {
		thinkingLevel = "off";
	}

	let fastMode = options.fastMode;
	if (fastMode === undefined && hasExistingSession) {
		fastMode = hasFastModeEntry ? existingSession.fastMode : false;
	}
	if (fastMode === undefined) {
		fastMode = false;
	}

	const defaultActiveToolNames: string[] = [...DEFAULT_ACTIVE_TOOL_NAMES];
	const initialActiveToolNames: string[] = options.tools
		? options.tools.map((tool) => tool.name)
		: defaultActiveToolNames;
	const baseToolsOverride = options.tools
		? Object.fromEntries(options.tools.map((tool) => [tool.name, tool] as const))
		: undefined;

	let agent: Agent;

	// Create convertToLlm wrapper that filters images if blockImages is enabled (defense-in-depth)
	const convertToLlmWithBlockImages = (messages: AgentMessage[]): Message[] => {
		const converted = convertToLlm(messages);
		// Check setting dynamically so mid-session changes take effect
		if (!settingsManager.getBlockImages()) {
			return converted;
		}
		// Filter out ImageContent from all messages, replacing with text placeholder
		return converted.map((msg) => {
			if (msg.role === "user" || msg.role === "toolResult") {
				const content = msg.content;
				if (Array.isArray(content)) {
					const hasImages = content.some((c) => c.type === "image");
					if (hasImages) {
						const filteredContent = content
							.map((c) =>
								c.type === "image" ? { type: "text" as const, text: "Image reading is disabled." } : c,
							)
							.filter(
								(c, i, arr) =>
									// Dedupe consecutive "Image reading is disabled." texts
									!(
										c.type === "text" &&
										c.text === "Image reading is disabled." &&
										i > 0 &&
										arr[i - 1].type === "text" &&
										(arr[i - 1] as { type: "text"; text: string }).text === "Image reading is disabled."
									),
							);
						return { ...msg, content: filteredContent };
					}
				}
			}
			return msg;
		});
	};

	const extensionRunnerRef: { current?: ExtensionRunner } = {};

	agent = new Agent({
		initialState: {
			systemPrompt: "",
			model,
			thinkingLevel,
			fastMode,
			tools: [],
		},
		convertToLlm: convertToLlmWithBlockImages,
		streamFn: async (model, context, options) => {
			const auth = await modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok) {
				throw new Error(auth.error);
			}
			return streamSimple(model, context, {
				...options,
				apiKey: auth.apiKey,
				headers: auth.headers || options?.headers ? { ...auth.headers, ...options?.headers } : undefined,
			});
		},
		onPayload: async (payload, _model) => {
			const runner = extensionRunnerRef.current;
			if (!runner?.hasHandlers("before_provider_request")) {
				return payload;
			}
			return runner.emitBeforeProviderRequest(payload);
		},
		sessionId: sessionManager.getSessionId(),
		transformContext: async (messages) => {
			const runner = extensionRunnerRef.current;
			if (!runner) return messages;
			return runner.emitContext(messages);
		},
		steeringMode: settingsManager.getSteeringMode(),
		followUpMode: settingsManager.getFollowUpMode(),
		transport: settingsManager.getTransport(),
		thinkingBudgets: settingsManager.getThinkingBudgets(),
		maxRetryDelayMs: settingsManager.getRetrySettings().maxDelayMs,
		...settingsManager.getToolExecutionSettings(),
	});

	// Restore messages if session has existing data
	if (hasExistingSession) {
		agent.state.messages = existingSession.messages;
		if (!hasThinkingEntry) {
			sessionManager.appendThinkingLevelChange(thinkingLevel);
		}
		if (!hasFastModeEntry && fastMode) {
			sessionManager.appendFastModeChange(fastMode);
		}
	} else {
		// Save initial model and thinking level for new sessions so they can be restored on resume
		if (model) {
			sessionManager.appendModelChange(model.provider, model.id);
		}
		sessionManager.appendThinkingLevelChange(thinkingLevel);
		if (fastMode) {
			sessionManager.appendFastModeChange(fastMode);
		}
	}

	const session = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd,
		scopedModels: options.scopedModels,
		resourceLoader,
		customTools: options.customTools,
		modelRegistry,
		initialActiveToolNames,
		baseToolsOverride,
		extensionRunnerRef,
		subagentContext: options.subagentContext,
		subagentInteractionBroker: options.subagentInteractionBroker,
		sessionStartEvent: options.sessionStartEvent,
	});
	const extensionsResult = resourceLoader.getExtensions();

	return {
		session,
		extensionsResult,
		modelFallbackMessage,
	};
}
