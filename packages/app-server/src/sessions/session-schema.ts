import type { SessionEntry, SessionHeader } from "@daedalus-pi/coding-agent";

export const GUI_SESSION_TABLES = {
	sessions: "gui_sessions",
	entries: "gui_session_entries",
	readModel: "gui_session_read_model",
	exports: "gui_session_exports",
	attachments: "gui_session_attachments",
	approvals: "gui_session_approvals",
} as const;

export type GuiSessionStatus = "active" | "idle" | "waiting_for_approval" | "archived" | "error";

export interface GuiSessionRow {
	readonly id: string;
	readonly cwd: string;
	readonly parent_session_id: string | null;
	readonly header_json: string;
	readonly archived: 0 | 1;
	readonly created_at: string;
	readonly updated_at: string;
}

export interface GuiSessionEntryRow {
	readonly session_id: string;
	readonly seq: number;
	readonly entry_id: string;
	readonly parent_id: string | null;
	readonly type: string;
	readonly entry_json: string;
	readonly created_at: string;
}

export interface GuiSessionReadModelRow {
	readonly session_id: string;
	readonly cwd: string;
	readonly title: string | null;
	readonly last_message_preview: string | null;
	readonly model: string | null;
	readonly thinking_level: string | null;
	readonly message_count: number;
	readonly pending_approval_count: number;
	readonly status: GuiSessionStatus;
	readonly updated_at: string;
}

export interface GuiSessionExportRow {
	readonly id: string;
	readonly session_id: string;
	readonly format: string;
	readonly content: string;
	readonly created_at: string;
}

export interface GuiSessionAttachmentRow {
	readonly id: string;
	readonly session_id: string;
	readonly entry_id: string | null;
	readonly path: string | null;
	readonly mime_type: string;
	readonly size_bytes: number;
	readonly data: Uint8Array | null;
	readonly created_at: string;
}

export interface GuiSessionApprovalRow {
	readonly id: string;
	readonly session_id: string;
	readonly entry_id: string | null;
	readonly status: "pending" | "approved" | "denied" | "cancelled";
	readonly request_json: string;
	readonly response_json: string | null;
	readonly created_at: string;
	readonly updated_at: string;
}

export type GuiSessionHeader = SessionHeader;
export type GuiSessionEntry = SessionEntry;
