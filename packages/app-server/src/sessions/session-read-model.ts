import type { SessionEntry, SessionHeader } from "@daedalus-pi/coding-agent";
import type { GuiSessionReadModelRow, GuiSessionStatus } from "./session-schema";

export interface RuntimeSessionEvent {
	readonly type: string;
	readonly payload?: unknown;
}

export interface ProjectGuiSessionReadModelOptions {
	readonly header: SessionHeader;
	readonly entries: readonly SessionEntry[];
	readonly events?: readonly RuntimeSessionEvent[];
	readonly archived?: boolean;
	readonly updatedAt?: string;
}

export interface GuiSessionReadModel {
	readonly sessionId: string;
	readonly cwd: string;
	readonly title: string | null;
	readonly lastMessagePreview: string | null;
	readonly model: string | null;
	readonly thinkingLevel: string | null;
	readonly messageCount: number;
	readonly pendingApprovalCount: number;
	readonly status: GuiSessionStatus;
	readonly updatedAt: string;
}

function stringifyContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === "string") return part;
				if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
				if (part && typeof part === "object" && "type" in part) return `[${String(part.type)}]`;
				return "";
			})
			.filter(Boolean)
			.join(" ");
	}
	return "";
}

function compactPreview(value: string, maxLength = 120): string | null {
	const compacted = value.replace(/\s+/g, " ").trim();
	if (!compacted) return null;
	return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}…` : compacted;
}

function eventPayload(event: RuntimeSessionEvent): Record<string, unknown> {
	return event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {};
}

export function projectGuiSessionReadModel(options: ProjectGuiSessionReadModelOptions): GuiSessionReadModel {
	let title: string | null = null;
	let lastMessagePreview: string | null = null;
	let model: string | null = null;
	let thinkingLevel: string | null = null;
	let messageCount = 0;
	let pendingApprovalCount = 0;
	let status: GuiSessionStatus = options.archived ? "archived" : "idle";
	let updatedAt = options.updatedAt ?? options.header.timestamp;

	for (const entry of options.entries) {
		updatedAt = entry.timestamp || updatedAt;
		if (entry.type === "session_info") {
			title = entry.name ?? title;
		} else if (entry.type === "message") {
			messageCount += 1;
			const message = entry.message as { content?: unknown; role?: string };
			const preview = compactPreview(stringifyContent(message.content));
			lastMessagePreview = preview ?? lastMessagePreview;
			if (!title && message.role === "user") title = preview;
		} else if (entry.type === "custom_message") {
			messageCount += 1;
			lastMessagePreview = compactPreview(stringifyContent(entry.content)) ?? lastMessagePreview;
		} else if (entry.type === "model_change") {
			model = entry.modelId;
		} else if (entry.type === "thinking_level_change") {
			thinkingLevel = entry.thinkingLevel;
		}
	}

	for (const event of options.events ?? []) {
		const payload = eventPayload(event);
		if (typeof payload.updatedAt === "string") updatedAt = payload.updatedAt;
		if (event.type.includes("approval") && (payload.status === "pending" || event.type.endsWith("requested"))) {
			pendingApprovalCount += 1;
		} else if (event.type.includes("approval") && pendingApprovalCount > 0) {
			pendingApprovalCount -= 1;
		}
		if (event.type.includes("error")) status = "error";
		else if (!options.archived && (event.type.includes("started") || event.type.includes("running"))) status = "active";
	}

	if (options.archived) status = "archived";
	else if (pendingApprovalCount > 0) status = "waiting_for_approval";

	return {
		sessionId: options.header.id,
		cwd: options.header.cwd,
		title,
		lastMessagePreview,
		model,
		thinkingLevel,
		messageCount,
		pendingApprovalCount,
		status,
		updatedAt,
	};
}

export function toGuiSessionReadModelRow(readModel: GuiSessionReadModel): GuiSessionReadModelRow {
	return {
		session_id: readModel.sessionId,
		cwd: readModel.cwd,
		title: readModel.title,
		last_message_preview: readModel.lastMessagePreview,
		model: readModel.model,
		thinking_level: readModel.thinkingLevel,
		message_count: readModel.messageCount,
		pending_approval_count: readModel.pendingApprovalCount,
		status: readModel.status,
		updated_at: readModel.updatedAt,
	};
}
