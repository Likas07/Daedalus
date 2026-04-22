import type { ThinkingLevel } from "@daedalus-pi/agent-core";
import type { Api, Model } from "@daedalus-pi/ai";
import type { ModelRegistry } from "../model-registry.js";
import type { SettingsManager } from "../settings-manager.js";
import { resolveSubagentPolicy } from "./policy.js";
import type { SubagentPolicy, SubagentRunRequest } from "./types.js";
import subagentBaseContract from "./subagent-base-contract.md" with { type: "text" };

export interface ResolvedSubagentRuntimeConfig {
	model?: Model<Api>;
	thinkingLevel?: ThinkingLevel;
	policy: SubagentPolicy;
	appendPrompts: string[];
	executionModePreference?: SubagentRunRequest["agent"]["executionModePreference"];
	isolationPreference?: SubagentRunRequest["agent"]["isolationPreference"];
}

export const SUBAGENT_BASE_CONTRACT = subagentBaseContract.trim();

function resolveSubagentPromptOverride(
	agent: { modelOverrides?: { gpt?: string; claude?: string } },
	modelId?: string,
): string | undefined {
	if (!modelId) return undefined;
	const normalized = modelId.toLowerCase();
	if (normalized.includes("gpt")) return agent.modelOverrides?.gpt;
	if (normalized.includes("claude")) return agent.modelOverrides?.claude;
	return undefined;
}

function buildDelegatedResultEnvelopeOverlay(): string {
	return [
		"Execution contract for this delegated run:",
		"- Your final handoff must be returned by calling submit_result exactly once.",
		"- Use this exact JSON shape:",
		"  { \"task\": \"string\", \"status\": \"completed | partial | blocked\", \"summary\": \"string\", \"output\": \"string\" }",
		"- summary must be brief and high-signal for the parent and subagent card UI.",
		"- output must contain the fuller deferred body that the parent may inspect later.",
		"- The parent receives a lightweight reference by default and can fetch full output with read_agent_result_output(result_id).",
	].join("\n");
}

export function buildSubagentAppendPrompts(input: {
	agent: Pick<SubagentRunRequest["agent"], "systemPrompt"> & {
		name?: string;
		modelOverrides?: { gpt?: string; claude?: string };
	};
	packetText?: string;
	modelId?: string;
}): string[] {
	const override = resolveSubagentPromptOverride(input.agent, input.modelId);
	return [
		SUBAGENT_BASE_CONTRACT,
		input.agent.systemPrompt.trim(),
		override?.trim(),
		buildDelegatedResultEnvelopeOverlay(),
		input.packetText ? `Delegated task packet:\n${input.packetText.trim()}` : undefined,
	].filter((prompt): prompt is string => Boolean(prompt));
}

function resolveModelReference(modelRef: string | undefined, modelRegistry: ModelRegistry): Model<Api> | undefined {
	if (!modelRef) return undefined;
	const [provider, modelId] = modelRef.split("/", 2);
	if (!provider || !modelId) return undefined;
	return modelRegistry.find(provider, modelId);
}

export function resolveSubagentRuntimeConfig(input: {
	request: SubagentRunRequest;
	packetText?: string;
	settingsManager: SettingsManager;
	modelRegistry: ModelRegistry;
}): ResolvedSubagentRuntimeConfig {
	const { request, packetText, settingsManager, modelRegistry } = input;
	const overrides = settingsManager.getSubagentSettings().agents[request.agent.name];
	const model = resolveModelReference(overrides?.model ?? request.agent.model, modelRegistry);

	return {
		model,
		thinkingLevel: overrides?.thinkingLevel ?? request.agent.thinkingLevel,
		policy: resolveSubagentPolicy(request.agent, request.policy),
		executionModePreference: overrides?.executionModePreference ?? request.agent.executionModePreference,
		isolationPreference: overrides?.isolationPreference ?? request.agent.isolationPreference,
		appendPrompts: buildSubagentAppendPrompts({
			agent: request.agent,
			packetText,
			modelId: model?.id,
		}),
	};
}
