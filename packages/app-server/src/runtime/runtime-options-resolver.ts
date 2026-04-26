import type { ThinkingLevel } from "@daedalus-pi/agent-core";
import type { Model } from "@daedalus-pi/ai";
import {
	type AgentSessionRuntimeDiagnostic,
	type AgentSessionServices,
	createBashTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@daedalus-pi/coding-agent";
import { type AccessPolicy, toPolicy } from "./access-policy-service";
import type { PromptContextInput, RuntimeSessionManager } from "./session-controller";

type Tool =
	| ReturnType<typeof createReadTool>
	| ReturnType<typeof createBashTool>
	| ReturnType<typeof createWriteTool>
	| ReturnType<typeof createGrepTool>
	| ReturnType<typeof createFindTool>
	| ReturnType<typeof createLsTool>;
const TOOL_CWD = process.cwd();

export interface ResolvedRuntimeOptions {
	readonly model?: Model<any>;
	readonly selectedModelId?: string;
	readonly thinkingLevel?: ThinkingLevel;
	readonly scopedModels?: Array<{ model: Model<any>; thinkingLevel?: ThinkingLevel }>;
	readonly tools?: Tool[];
	readonly accessPolicy: AccessPolicy;
	readonly resourceSettings: { mode: string };
	readonly sessionDir?: string;
	readonly diagnostics: AgentSessionRuntimeDiagnostic[];
}

export interface RuntimeOptionsResolverInput {
	readonly context?: PromptContextInput;
	readonly services: AgentSessionServices;
	readonly sessionManager: RuntimeSessionManager;
}

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
const TOOL_PRESETS: Record<string, readonly string[]> = {
	daedalus: ["read", "bash", "write", "grep", "find", "ls"],
	sage: ["read", "grep", "find", "ls"],
	muse: ["read", "grep", "find", "ls"],
};

const BUILT_IN_TOOLS: Record<string, Tool> = {
	read: createReadTool(TOOL_CWD),
	bash: createBashTool(TOOL_CWD),
	write: createWriteTool(TOOL_CWD),
	grep: createGrepTool(TOOL_CWD),
	find: createFindTool(TOOL_CWD),
	ls: createLsTool(TOOL_CWD),
};

export async function resolveRuntimeOptions(input: RuntimeOptionsResolverInput): Promise<ResolvedRuntimeOptions> {
	const diagnostics: AgentSessionRuntimeDiagnostic[] = [];
	const context = input.context;
	const mode = context?.mode === "sage" || context?.mode === "muse" ? context.mode : "daedalus";
	const available = input.services.modelRegistry.getAll();
	let model: Model<any> | undefined;
	let selectedModelId: string | undefined;
	if (context?.model) {
		model = findModel(context.model, available);
		selectedModelId = context.model;
		if (!model) {
			diagnostics.push({ type: "warning", message: `GUI selected model not found: ${context.model}` });
		}
	}
	const thinkingLevel = clampThinking(context?.effort, model, diagnostics);
	const toolNames = mode === "daedalus" && context?.tools?.length ? context.tools : TOOL_PRESETS[mode];
	const tools = resolveTools(toolNames, diagnostics);
	const accessPolicy = toPolicy(context?.accessMode);
	persistFastMode(input.sessionManager, context?.fastMode, diagnostics);
	return {
		model,
		selectedModelId,
		thinkingLevel,
		scopedModels: model ? [{ model, thinkingLevel }] : undefined,
		tools,
		accessPolicy,
		resourceSettings: { mode },
		sessionDir: sessionDirOf(input.sessionManager),
		diagnostics,
	};
}

function findModel(reference: string, models: Model<any>[]): Model<any> | undefined {
	const lower = reference.toLowerCase();
	return models.find(
		(model) => `${model.provider}/${model.id}`.toLowerCase() === lower || model.id.toLowerCase() === lower,
	);
}

function clampThinking(
	value: string | undefined,
	model: Model<any> | undefined,
	diagnostics: AgentSessionRuntimeDiagnostic[],
): ThinkingLevel | undefined {
	if (!value) return undefined;
	const requested = THINKING_LEVELS.includes(value as ThinkingLevel) ? (value as ThinkingLevel) : "medium";
	if (requested !== value)
		diagnostics.push({ type: "warning", message: `Invalid thinking effort '${value}', using medium` });
	if (model && !model.reasoning && requested !== "off") {
		diagnostics.push({
			type: "warning",
			message: `Model ${model.provider}/${model.id} does not support thinking; using off`,
		});
		return "off";
	}
	if (requested === "xhigh" && model && !String(model.id).toLowerCase().includes("opus")) {
		diagnostics.push({
			type: "warning",
			message: `Thinking effort xhigh is not supported by ${model.provider}/${model.id}; using high`,
		});
		return "high";
	}
	return requested;
}

function resolveTools(names: readonly string[], diagnostics: AgentSessionRuntimeDiagnostic[]): Tool[] {
	const tools: Tool[] = [];
	for (const name of names) {
		const tool = BUILT_IN_TOOLS[name];
		if (tool) tools.push(tool);
		else diagnostics.push({ type: "warning", message: `Unknown GUI tool ignored: ${name}` });
	}
	return tools;
}

function persistFastMode(
	sessionManager: RuntimeSessionManager,
	fastMode: boolean | undefined,
	diagnostics: AgentSessionRuntimeDiagnostic[],
): void {
	if (fastMode === undefined) return;
	const manager = sessionManager as { appendFastModeChange?: (fastMode: boolean) => string };
	manager.appendFastModeChange?.(fastMode);
	diagnostics.push({
		type: "info",
		message:
			"Fast mode selection was persisted; runtime fast-mode API support is handled by coding-agent session creation.",
	});
}

function sessionDirOf(sessionManager: RuntimeSessionManager): string | undefined {
	const manager = sessionManager as { sessionDir?: string; getSessionDir?: () => string | undefined };
	return manager.getSessionDir?.() ?? manager.sessionDir;
}
