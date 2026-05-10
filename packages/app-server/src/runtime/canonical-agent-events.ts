export interface RuntimeAgentEvent {
	readonly type: string;
	readonly [key: string]: unknown;
}

export type CanonicalAgentEvent =
	| {
			type: "agent/message_start";
			payload: {
				sessionId: string;
				turnId: string;
				messageId: string;
				role: "assistant";
				responseId?: string;
				provider?: string;
				model?: string;
			};
	  }
	| {
			type: "agent/message_delta";
			payload: {
				sessionId: string;
				turnId: string;
				messageId: string;
				delta: string;
			};
	  }
	| {
			type: "agent/message_end";
			payload: {
				sessionId: string;
				turnId: string;
				messageId: string;
				role: "assistant";
				content: string;
				responseId?: string;
				provider?: string;
				model?: string;
				usage?: unknown;
			};
	  }
	| {
			type: "agent/tool_start";
			payload: {
				sessionId: string;
				turnId: string;
				toolCallId: string;
				toolName: string;
				input?: unknown;
			};
	  }
	| {
			type: "agent/tool_delta";
			payload: {
				sessionId: string;
				turnId: string;
				toolCallId: string;
				delta: string;
			};
	  }
	| {
			type: "agent/tool_end";
			payload: {
				sessionId: string;
				turnId: string;
				toolCallId: string;
				status: "completed" | "failed" | "cancelled";
				output?: unknown;
				error?: string;
			};
	  };

export interface CanonicalizeRuntimeEventOptions {
	readonly sessionId: string;
	readonly turnId?: string;
}

export interface CanonicalizeRuntimeEventResult {
	readonly handled: boolean;
	readonly events: readonly CanonicalAgentEvent[];
}

interface MessageState {
	readonly messageId: string;
	readonly turnId: string;
	readonly responseId?: string;
	readonly provider?: string;
	readonly model?: string;
	started: boolean;
	completed: boolean;
}

export class CanonicalAgentEventNormalizer {
	private readonly messages = new Map<string, MessageState>();
	private readonly activeFallbackMessageByTurn = new Map<string, MessageState>();
	private readonly fallbackCounters = new Map<string, number>();

	normalize(event: RuntimeAgentEvent, options: CanonicalizeRuntimeEventOptions): CanonicalizeRuntimeEventResult {
		if (!options.turnId) return { handled: isKnownRuntimeItemEvent(event), events: [] };
		const scopedOptions = { ...options, turnId: options.turnId };
		switch (event.type) {
			case "message_start":
				return this.normalizeMessageStart(event, scopedOptions);
			case "message_update":
				return this.normalizeMessageUpdate(event, scopedOptions);
			case "message_end":
				return this.normalizeMessageEnd(event, scopedOptions);
			case "text_start":
				return this.normalizeTextStart(event, scopedOptions);
			case "text_delta":
				return this.normalizeTextDelta(event, scopedOptions);
			case "text_end":
				return { handled: true, events: [] };
			case "tool_execution_start":
			case "tool_start":
				return this.normalizeToolStart(event, scopedOptions);
			case "tool_execution_update":
			case "tool_delta":
				return this.normalizeToolDelta(event, scopedOptions);
			case "tool_execution_end":
			case "tool_end":
				return this.normalizeToolEnd(event, scopedOptions);
			default:
				return { handled: false, events: [] };
		}
	}

	private normalizeMessageStart(
		event: RuntimeAgentEvent,
		options: RequiredTurnOptions,
	): CanonicalizeRuntimeEventResult {
		const message = asRecord(event.message);
		if (roleFrom(event, message) !== "assistant") return { handled: true, events: [] };
		const state = this.resolveMessageState(event, options, { starting: true });
		return { handled: true, events: this.startEvent(state, options.sessionId) };
	}

	private normalizeMessageUpdate(
		event: RuntimeAgentEvent,
		options: RequiredTurnOptions,
	): CanonicalizeRuntimeEventResult {
		const message = asRecord(event.message);
		if (roleFrom(event, message) !== "assistant") return { handled: true, events: [] };
		const assistantMessageEvent = asRecord(event.assistantMessageEvent);
		if (assistantMessageEvent.type === "text_start")
			return this.normalizeTextStart({ ...event, ...assistantMessageEvent }, options);
		if (assistantMessageEvent.type === "text_end") return { handled: true, events: [] };
		if (assistantMessageEvent.type !== "text_delta" && text(event, "delta") === undefined) {
			return { handled: true, events: [] };
		}
		const delta = text(event, "delta") ?? text(assistantMessageEvent, "delta");
		if (!delta) return { handled: true, events: [] };
		const state = this.resolveMessageState(event, options, { starting: false });
		return {
			handled: true,
			events: [
				...this.startEvent(state, options.sessionId),
				{
					type: "agent/message_delta",
					payload: { sessionId: options.sessionId, turnId: options.turnId, messageId: state.messageId, delta },
				},
			],
		};
	}

	private normalizeMessageEnd(event: RuntimeAgentEvent, options: RequiredTurnOptions): CanonicalizeRuntimeEventResult {
		const message = asRecord(event.message);
		if (roleFrom(event, message) !== "assistant") return { handled: true, events: [] };
		const state = this.resolveMessageState(event, options, { ending: true });
		if (state.completed) return { handled: true, events: [] };
		state.completed = true;
		if (this.activeFallbackMessageByTurn.get(options.turnId) === state) this.activeFallbackMessageByTurn.delete(options.turnId);
		const metadata = messageMetadata(event, message);
		return {
			handled: true,
			events: [
				...this.startEvent(state, options.sessionId),
				{
					type: "agent/message_end",
					payload: {
						sessionId: options.sessionId,
						turnId: options.turnId,
						messageId: state.messageId,
						role: "assistant",
						content: content(message) || content(event),
						...(metadata.responseId ? { responseId: metadata.responseId } : {}),
						...(metadata.provider ? { provider: metadata.provider } : {}),
						...(metadata.model ? { model: metadata.model } : {}),
						...(event.usage !== undefined ? { usage: event.usage } : message.usage !== undefined ? { usage: message.usage } : {}),
					},
				},
			],
		};
	}

	private normalizeTextStart(event: RuntimeAgentEvent, options: RequiredTurnOptions): CanonicalizeRuntimeEventResult {
		const state = this.resolveMessageState(event, options, { starting: true });
		return { handled: true, events: this.startEvent(state, options.sessionId) };
	}

	private normalizeTextDelta(event: RuntimeAgentEvent, options: RequiredTurnOptions): CanonicalizeRuntimeEventResult {
		const delta = text(event, "delta");
		if (!delta) return { handled: true, events: [] };
		const state = this.resolveMessageState(event, options, { starting: false });
		return {
			handled: true,
			events: [
				...this.startEvent(state, options.sessionId),
				{
					type: "agent/message_delta",
					payload: { sessionId: options.sessionId, turnId: options.turnId, messageId: state.messageId, delta },
				},
			],
		};
	}

	private normalizeToolStart(event: RuntimeAgentEvent, options: RequiredTurnOptions): CanonicalizeRuntimeEventResult {
		const toolCallId = text(event, "toolCallId", "tool_call_id", "id");
		if (!toolCallId) return { handled: true, events: [] };
		return {
			handled: true,
			events: [
				{
					type: "agent/tool_start",
					payload: {
						sessionId: options.sessionId,
						turnId: options.turnId,
						toolCallId,
						toolName: text(event, "toolName", "tool_name", "name") ?? "tool",
						...(event.args !== undefined ? { input: event.args } : event.input !== undefined ? { input: event.input } : {}),
					},
				},
			],
		};
	}

	private normalizeToolDelta(event: RuntimeAgentEvent, options: RequiredTurnOptions): CanonicalizeRuntimeEventResult {
		const toolCallId = text(event, "toolCallId", "tool_call_id", "id");
		if (!toolCallId) return { handled: true, events: [] };
		const delta = text(event, "delta", "content", "text", "summary") ?? textValue(event.partialResult);
		if (!delta) return { handled: true, events: [] };
		return {
			handled: true,
			events: [
				{
					type: "agent/tool_delta",
					payload: { sessionId: options.sessionId, turnId: options.turnId, toolCallId, delta },
				},
			],
		};
	}

	private normalizeToolEnd(event: RuntimeAgentEvent, options: RequiredTurnOptions): CanonicalizeRuntimeEventResult {
		const toolCallId = text(event, "toolCallId", "tool_call_id", "id");
		if (!toolCallId) return { handled: true, events: [] };
		const status = toolStatus(event);
		return {
			handled: true,
			events: [
				{
					type: "agent/tool_end",
					payload: {
						sessionId: options.sessionId,
						turnId: options.turnId,
						toolCallId,
						status,
						...(event.result !== undefined ? { output: event.result } : event.output !== undefined ? { output: event.output } : {}),
						...(status === "failed" ? { error: text(event, "error", "errorMessage", "message") ?? textValue(event.result) } : {}),
					},
				},
			],
		};
	}

	private startEvent(state: MessageState, sessionId: string): CanonicalAgentEvent[] {
		if (state.started) return [];
		state.started = true;
		return [
			{
				type: "agent/message_start",
				payload: {
					sessionId,
					turnId: state.turnId,
					messageId: state.messageId,
					role: "assistant",
					...(state.responseId ? { responseId: state.responseId } : {}),
					...(state.provider ? { provider: state.provider } : {}),
					...(state.model ? { model: state.model } : {}),
				},
			},
		];
	}

	private resolveMessageState(
		event: RuntimeAgentEvent,
		options: RequiredTurnOptions,
		mode: { readonly starting?: boolean; readonly ending?: boolean },
	): MessageState {
		const message = asRecord(event.message);
		const metadata = messageMetadata(event, message);
		const explicitId = explicitMessageId(event, message);
		const responseId = metadata.responseId;
		const identity = explicitId ?? responseId;
		if (identity) {
			const existing = this.messages.get(identity);
			if (existing) return existing;
			const created = {
				messageId: identity,
				turnId: options.turnId,
				responseId,
				provider: metadata.provider,
				model: metadata.model,
				started: false,
				completed: false,
			};
			this.messages.set(identity, created);
			return created;
		}

		const active = this.activeFallbackMessageByTurn.get(options.turnId);
		if (active && !mode.starting) return active;

		const base = `${options.turnId}:assistant`;
		const count = this.fallbackCounters.get(base) ?? 0;
		const messageId = count === 0 ? base : `${base}:${count + 1}`;
		this.fallbackCounters.set(base, count + 1);
		const created = {
			messageId,
			turnId: options.turnId,
			responseId,
			provider: metadata.provider,
			model: metadata.model,
			started: false,
			completed: false,
		};
		this.messages.set(messageId, created);
		this.activeFallbackMessageByTurn.set(options.turnId, created);
		return created;
	}
}

type RequiredTurnOptions = CanonicalizeRuntimeEventOptions & { readonly turnId: string };

function isKnownRuntimeItemEvent(event: RuntimeAgentEvent): boolean {
	return (
		event.type === "message_start" ||
		event.type === "message_update" ||
		event.type === "message_end" ||
		event.type === "text_start" ||
		event.type === "text_delta" ||
		event.type === "text_end" ||
		event.type === "tool_execution_start" ||
		event.type === "tool_execution_update" ||
		event.type === "tool_execution_end" ||
		event.type === "tool_start" ||
		event.type === "tool_delta" ||
		event.type === "tool_end"
	);
}

function explicitMessageId(event: RuntimeAgentEvent, message: JsonRecord): string | undefined {
	const assistantMessageEvent = asRecord(event.assistantMessageEvent);
	const partial = firstRecord(event.partial, assistantMessageEvent.partial);
	return (
		text(event, "messageId", "message_id") ??
		text(message, "id", "messageId", "message_id") ??
		text(partial, "id", "messageId", "message_id")
	);
}

function messageMetadata(event: RuntimeAgentEvent, message: JsonRecord): {
	readonly responseId?: string;
	readonly provider?: string;
	readonly model?: string;
} {
	const assistantMessageEvent = asRecord(event.assistantMessageEvent);
	const partial = firstRecord(event.partial, assistantMessageEvent.partial);
	return {
		responseId:
			text(event, "responseId", "response_id") ??
			text(message, "responseId", "response_id") ??
			text(partial, "responseId", "response_id"),
		provider:
			text(event, "provider") ??
			text(message, "provider") ??
			text(partial, "provider") ??
			text(event, "api") ??
			text(message, "api") ??
			text(partial, "api"),
		model: text(event, "model") ?? text(message, "model") ?? text(partial, "model"),
	};
}

function roleFrom(event: RuntimeAgentEvent, message: JsonRecord): string | undefined {
	return text(event, "role") ?? text(message, "role");
}

function toolStatus(event: RuntimeAgentEvent): "completed" | "failed" | "cancelled" {
	const status = text(event, "status");
	if (status === "failed" || status === "cancelled") return status;
	if (event.isError === true) return "failed";
	if (text(event, "error", "errorMessage")) return "failed";
	return "completed";
}

function content(record: Readonly<Record<string, unknown>>): string {
	return text(record, "content", "text", "message") ?? "";
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function firstRecord(...values: unknown[]): JsonRecord {
	for (const value of values) {
		const record = asRecord(value);
		if (Object.keys(record).length > 0) return record;
	}
	return {};
}

function text(record: Readonly<Record<string, unknown>>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = textValue(record[key]);
		if (value !== undefined && value.length > 0) return value;
	}
	return undefined;
}

function textValue(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) {
		const parts = value.map(textPart).filter((part): part is string => part !== undefined);
		return parts.length > 0 ? parts.join("") : undefined;
	}
	if (value && typeof value === "object") {
		const record = value as JsonRecord;
		return textValue(record.text) ?? textValue(record.content) ?? textValue(record.message) ?? textValue(record.summary);
	}
	return undefined;
}

function textPart(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (!value || typeof value !== "object") return undefined;
	const record = value as JsonRecord;
	const type = record.type;
	if (type === "text" || type === "thinking" || type === undefined) {
		return textValue(record.text) ?? textValue(record.content);
	}
	return undefined;
}
