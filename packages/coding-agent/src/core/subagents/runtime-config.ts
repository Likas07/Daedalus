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

export function buildSubagentAppendPrompts(input: {
	agent: Pick<SubagentRunRequest["agent"], "systemPrompt">;
	packetText?: string;
}): string[] {
	return [
		SUBAGENT_BASE_CONTRACT,
		input.agent.systemPrompt.trim(),
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

	return {
		model: resolveModelReference(overrides?.model ?? request.agent.model, modelRegistry),
		thinkingLevel: overrides?.thinkingLevel ?? request.agent.thinkingLevel,
		policy: resolveSubagentPolicy(request.agent, request.policy),
		executionModePreference: overrides?.executionModePreference ?? request.agent.executionModePreference,
		isolationPreference: overrides?.isolationPreference ?? request.agent.isolationPreference,
		appendPrompts: buildSubagentAppendPrompts({
			agent: request.agent,
			packetText,
		}),
	};
}
