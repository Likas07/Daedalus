export type SessionEntryLike = {
	readonly type: string;
	readonly id: string;
	readonly parentId?: string | null;
	readonly timestamp?: string;
	readonly [key: string]: unknown;
};

export type TimelineRowKind =
	| "user"
	| "assistant"
	| "tool"
	| "bash"
	| "approval"
	| "model"
	| "thinking"
	| "fast-mode"
	| "compaction"
	| "branch-summary"
	| "custom"
	| "custom-message"
	| "label"
	| "skill"
	| "target"
	| "system"
	| "debug";

export interface TimelineRow {
	readonly id: string;
	readonly kind: TimelineRowKind;
	readonly sessionId?: string;
	readonly title: string;
	readonly summary: string;
	readonly timestamp?: string;
	readonly raw: unknown;
	readonly entryId?: string;
	readonly messageId?: string;
	readonly eventId?: string;
	readonly parentId?: string | null;
	readonly status?: string;
	readonly content?: string;
	readonly details?: readonly string[];
	readonly containsSensitiveRaw?: boolean;
	readonly live?: boolean;
}

export function projectSessionEntries(entries: readonly SessionEntryLike[], sessionId?: string): TimelineRow[] {
	return entries.flatMap((entry, index) => projectSessionEntry(entry, { sessionId, sequence: index }));
}

export function projectSessionEntry(
	entry: SessionEntryLike,
	options: { readonly sessionId?: string; readonly sequence?: number } = {},
): TimelineRow[] {
	const base = baseRow(entry, options);
	switch (entry.type) {
		case "message":
			return projectMessageEntry(entry, base);
		case "model_change":
			return [
				{
					...base,
					kind: "model",
					title: "Model changed",
					summary: `${stringField(entry.provider)} ${stringField(entry.modelId)}`.trim(),
				},
			];
		case "thinking_level_change":
			return [{ ...base, kind: "thinking", title: "Thinking changed", summary: stringField(entry.thinkingLevel) }];
		case "fast_mode_change":
			return [{ ...base, kind: "fast-mode", title: "Fast mode", summary: entry.fastMode ? "Enabled" : "Disabled" }];
		case "compaction":
			return [
				{
					...base,
					kind: "compaction",
					title: "Context compacted",
					summary: stringField(entry.summary),
					details: [
						`Tokens before: ${numberField(entry.tokensBefore)}`,
						`First kept: ${stringField(entry.firstKeptEntryId)}`,
					],
				},
			];
		case "runs_in": {
			const runsIn = record(entry.runsIn);
			const path = stringField(runsIn.path) || stringField(entry.path);
			const branch = stringField(runsIn.branch) || stringField(entry.branch);
			return [
				{
					...base,
					kind: "target",
					title: "Runs in",
					summary: [path, branch].filter(Boolean).join(" · "),
					details: [
						stringField(runsIn.isolationMode) || stringField(entry.isolationMode),
						stringField(runsIn.validationStatus) || stringField(entry.validationStatus),
					].filter(Boolean),
				},
			];
		}
		case "session_resume_identity": {
			const identity = record(entry.identity);
			const status = stringField(identity.status) || stringField(entry.status);
			return [
				{
					...base,
					kind: "target",
					title: "Resume identity",
					summary: [status, stringField(identity.message) || stringField(entry.message)]
						.filter(Boolean)
						.join(" · "),
					status,
					details: [
						`Stored cwd: ${stringField(identity.storedCwd)}`,
						`Current cwd: ${stringField(identity.currentCwd)}`,
						`Stored worktree: ${stringField(identity.storedWorktreeId)}`,
						`Current worktree: ${stringField(identity.currentWorktreeId)}`,
					].filter((detail) => !detail.endsWith(": ")),
				},
			];
		}
		case "branch_summary":
			return [
				{
					...base,
					kind: "branch-summary",
					title: "Branch summary",
					summary: stringField(entry.summary),
					details: [`From: ${stringField(entry.fromId)}`],
				},
			];
		case "custom":
			return [
				{
					...base,
					kind: customKind(entry),
					title: customTitle(entry, "Custom event"),
					summary: summarizeUnknown(entry.data),
				},
			];
		case "custom_message":
			if (entry.display === false) return [];
			return [
				{
					...base,
					kind: customKind(entry) === "skill" ? "skill" : "custom-message",
					title: customTitle(entry, "Custom message"),
					summary: contentText(entry.content),
					content: contentText(entry.content),
					details: [stringField(entry.customType)].filter(Boolean),
				},
			];
		case "label":
			return [
				{
					...base,
					kind: "label",
					title: "Label",
					summary: stringField(entry.label),
					details: [`Target: ${stringField(entry.targetId)}`],
				},
			];
		case "session_info":
			return [{ ...base, kind: "system", title: "Session renamed", summary: stringField(entry.name) }];
		default:
			return [{ ...base, kind: "debug", title: titleCase(entry.type), summary: summarizeUnknown(entry) }];
	}
}

function projectMessageEntry(
	entry: SessionEntryLike,
	base: Omit<TimelineRow, "kind" | "title" | "summary">,
): TimelineRow[] {
	const message = record(entry.message);
	const role = stringField(message.role);
	if (role === "toolResult") {
		const toolName = stringField(message.toolName);
		return [
			{
				...base,
				kind: toolName === "bash" ? "bash" : "tool",
				title: `${toolName || "Tool"} result`,
				summary: contentText(message.content),
				content: contentText(message.content),
				status: message.isError ? "error" : "completed",
				messageId: stringField(message.toolCallId) || entry.id,
			},
		];
	}
	if (role === "assistant") {
		const content = Array.isArray(message.content) ? message.content : [];
		const text = content
			.map((part) => record(part))
			.filter((part) => part.type === "text" || part.type === "thinking")
			.map((part) => stringField(part.text) || stringField(part.thinking))
			.filter(Boolean)
			.join("\n");
		const calls = content.map((part) => record(part)).filter((part) => part.type === "toolCall");
		const stopReason = stringField(message.stopReason);
		const errorMessage = stringField(message.errorMessage);
		const displayText = errorMessage && (stopReason === "error" || !text) ? errorMessage : text;
		const assistantRows =
			displayText || calls.length > 0
				? [
						{
							...base,
							kind: "assistant" as const,
							title: "Assistant",
							summary: displayText,
							content: displayText,
							status: stopReason || (errorMessage ? "error" : undefined),
							messageId: stringField(message.responseId) || entry.id,
							details: [stringField(message.model)].filter(Boolean),
						},
					]
				: [];
		return [
			...assistantRows,
			...calls.map((call) => ({
				...base,
				id: `entry:${entry.id}:tool:${stringField(call.id)}`,
				kind: stringField(call.name) === "bash" ? ("bash" as const) : ("tool" as const),
				title: `${stringField(call.name) || "Tool"} call`,
				summary: summarizeUnknown(call.arguments),
				messageId: stringField(call.id) || undefined,
				raw: call,
			})),
		];
	}
	return [
		{
			...base,
			kind: role === "user" ? "user" : "system",
			title: role === "user" ? "User" : titleCase(role || "message"),
			summary: contentText(message.content),
			content: contentText(message.content),
			messageId: entry.id,
		},
	];
}

function baseRow(
	entry: SessionEntryLike,
	options: { readonly sessionId?: string; readonly sequence?: number },
): Omit<TimelineRow, "kind" | "title" | "summary"> {
	return {
		id: `entry:${entry.id || options.sequence || "unknown"}`,
		sessionId: options.sessionId,
		timestamp: entry.timestamp,
		raw: entry,
		entryId: entry.id,
		parentId: typeof entry.parentId === "string" || entry.parentId === null ? entry.parentId : undefined,
	};
}

function customKind(entry: SessionEntryLike): TimelineRowKind {
	const type = stringField(entry.customType).toLowerCase();
	if (type.includes("skill")) return "skill";
	if (type.includes("bash")) return "bash";
	if (type.includes("approval")) return "approval";
	return "custom";
}
function customTitle(entry: SessionEntryLike, fallback: string): string {
	return stringField(entry.customType) ? `${fallback}: ${stringField(entry.customType)}` : fallback;
}
function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function stringField(value: unknown): string {
	return typeof value === "string" ? value : "";
}
function numberField(value: unknown): number | string {
	return typeof value === "number" ? value : "unknown";
}
function stripGuiContextBlocks(value: string): string {
	return value.replace(/<gui-context>[\s\S]*?<\/gui-context>/gi, " ").replace(/<gui-context>[\s\S]*$/gi, " ");
}

function contentText(value: unknown): string {
	const text =
		typeof value === "string"
			? value
			: Array.isArray(value)
				? value
						.map((part) => stringField(record(part).text) || (record(part).type === "image" ? "[image]" : ""))
						.filter(Boolean)
						.join("\n")
				: summarizeUnknown(value);
	return stripGuiContextBlocks(text).trim();
}
function summarizeUnknown(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
function titleCase(value: string): string {
	return value
		.split(/[/_-]/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}
