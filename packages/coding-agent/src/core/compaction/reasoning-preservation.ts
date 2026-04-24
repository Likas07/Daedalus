import type { AgentMessage } from "@daedalus-pi/agent-core";
import type { AssistantMessage, ThinkingContent, ToolCall } from "@daedalus-pi/ai";

export interface ReasoningSnapshot {
	source?: {
		api: string;
		provider: string;
		model: string;
	};
	thinkingBlocks?: ThinkingContent[];
	reasoningDetails?: unknown;
	providerMetadata?: Record<string, unknown>;
	toolThoughtSignatures?: Array<{ id: string; thoughtSignature: string }>;
}

function cloneJson<T>(value: T): T {
	if (value === undefined || value === null) return value;
	return JSON.parse(JSON.stringify(value)) as T;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyReasoningDetails(value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (Array.isArray(value)) return value.length > 0;
	if (typeof value === "string") return value.trim().length > 0;
	if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
	return true;
}

function isAssistant(message: AgentMessage): message is AssistantMessage {
	return message.role === "assistant";
}

const PROVIDER_REASONING_METADATA_KEYS = new Set([
	"provider_reasoning_blob",
	"reasoning_blob",
	"reasoning_encrypted",
	"reasoning_signature",
	"thinking_signature",
	"thought_signature",
]);

function isProviderReasoningMetadataKey(key: string): boolean {
	if (PROVIDER_REASONING_METADATA_KEYS.has(key)) return true;
	return key.startsWith("provider_reasoning_") || key.startsWith("reasoning_");
}

function extractProviderMetadata(message: AssistantMessage): Record<string, unknown> | undefined {
	const record = message as unknown as Record<string, unknown>;
	const metadata: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (key === "reasoning_details") continue;
		if (key === "content") continue;
		if (key === "usage") continue;
		if (key === "role" || key === "api" || key === "provider" || key === "model") continue;
		if (key === "stopReason" || key === "timestamp" || key === "errorMessage") continue;
		if (isProviderReasoningMetadataKey(key)) {
			metadata[key] = cloneJson(value);
		}
	}
	return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function sourceFromAssistant(message: AssistantMessage): ReasoningSnapshot["source"] {
	return { api: message.api, provider: message.provider, model: message.model };
}

function snapshotFromAssistant(message: AssistantMessage): ReasoningSnapshot | undefined {
	const thinkingBlocks = message.content
		.filter((block): block is ThinkingContent => block.type === "thinking")
		.filter((block) => isNonEmptyString(block.thinking) || isNonEmptyString(block.thinkingSignature));
	const reasoningDetails = (message as unknown as { reasoning_details?: unknown }).reasoning_details;
	const toolThoughtSignatures = message.content
		.filter((block): block is ToolCall => block.type === "toolCall")
		.filter((block) => isNonEmptyString(block.thoughtSignature))
		.map((block) => ({ id: block.id, thoughtSignature: block.thoughtSignature! }));
	const providerMetadata = extractProviderMetadata(message);

	const snapshot: ReasoningSnapshot = { source: sourceFromAssistant(message) };
	if (thinkingBlocks.length > 0) snapshot.thinkingBlocks = cloneJson(thinkingBlocks);
	if (isNonEmptyReasoningDetails(reasoningDetails)) {
		snapshot.reasoningDetails = cloneJson(reasoningDetails);
	}
	if (toolThoughtSignatures.length > 0) snapshot.toolThoughtSignatures = cloneJson(toolThoughtSignatures);
	if (providerMetadata) snapshot.providerMetadata = providerMetadata;

	return isReasoningSnapshotEmpty(snapshot) ? undefined : snapshot;
}

function isReasoningSnapshotEmpty(snapshot: ReasoningSnapshot | undefined): boolean {
	if (!snapshot) return true;
	return !(
		(snapshot.thinkingBlocks?.length ?? 0) > 0 ||
		isNonEmptyReasoningDetails(snapshot.reasoningDetails) ||
		Object.keys(snapshot.providerMetadata ?? {}).length > 0 ||
		(snapshot.toolThoughtSignatures?.length ?? 0) > 0
	);
}

function isCompatibleWithSource(message: AssistantMessage, snapshot: ReasoningSnapshot): boolean {
	return (
		snapshot.source !== undefined &&
		message.api === snapshot.source.api &&
		message.provider === snapshot.source.provider &&
		message.model === snapshot.source.model
	);
}

function thinkingBlocksForInjection(snapshot: ReasoningSnapshot, includeOpaque: boolean): ThinkingContent[] {
	return (snapshot.thinkingBlocks ?? []).flatMap((block) => {
		if (includeOpaque) return [cloneJson(block)];
		if (block.redacted) return [];
		if (!isNonEmptyString(block.thinking)) return [];
		return [{ type: "thinking", thinking: block.thinking }];
	});
}

function snapshotKey(snapshot: ReasoningSnapshot): string {
	return JSON.stringify(snapshot);
}

function messageHasSnapshot(message: AssistantMessage, snapshot: ReasoningSnapshot): boolean {
	const existing = snapshotFromAssistant(message);
	return existing !== undefined && snapshotKey(existing) === snapshotKey(snapshot);
}

function assistantHasReasoning(message: AssistantMessage): boolean {
	return snapshotFromAssistant(message) !== undefined;
}

export function extractLastReasoning(messages: AgentMessage[]): ReasoningSnapshot | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (!isAssistant(message)) continue;
		const snapshot = snapshotFromAssistant(message);
		if (snapshot) return snapshot;
	}
	return undefined;
}

export function injectReasoningIntoFirstEmptyAssistant(
	messages: AgentMessage[],
	snapshot: ReasoningSnapshot | undefined,
): boolean {
	if (isReasoningSnapshotEmpty(snapshot)) return false;
	const reasoning = snapshot!;
	if (messages.some((message) => isAssistant(message) && messageHasSnapshot(message, reasoning))) {
		return false;
	}
	const index = messages.findIndex((message) => isAssistant(message) && !assistantHasReasoning(message));
	if (index === -1) return false;

	const assistant = messages[index] as AssistantMessage;
	const isCompatible = isCompatibleWithSource(assistant, reasoning);
	const thinkingBlocks = thinkingBlocksForInjection(reasoning, isCompatible);
	const hasMatchingToolThoughtSignature =
		isCompatible &&
		assistant.content.some(
			(block) => block.type === "toolCall" && reasoning.toolThoughtSignatures?.some((sig) => sig.id === block.id),
		);
	if (
		thinkingBlocks.length === 0 &&
		!(isCompatible && reasoning.reasoningDetails !== undefined) &&
		!(isCompatible && reasoning.providerMetadata) &&
		!hasMatchingToolThoughtSignature
	) {
		return false;
	}
	const next: AssistantMessage = {
		...assistant,
		content: [
			...thinkingBlocks,
			...assistant.content.map((block) => {
				if (block.type !== "toolCall") return block;
				if (!isCompatible) return block;
				const match = reasoning.toolThoughtSignatures?.find((sig) => sig.id === block.id);
				return match ? { ...block, thoughtSignature: match.thoughtSignature } : block;
			}),
		],
	};
	if (isCompatible && reasoning.reasoningDetails !== undefined) {
		(next as unknown as { reasoning_details?: unknown }).reasoning_details = cloneJson(reasoning.reasoningDetails);
	}
	if (isCompatible && reasoning.providerMetadata) {
		Object.assign(next as unknown as Record<string, unknown>, cloneJson(reasoning.providerMetadata));
	}
	messages[index] = next;
	return true;
}
