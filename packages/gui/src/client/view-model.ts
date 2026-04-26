import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import type { AccessMode } from "./gui-state-types";
import { projectTranscriptEvent, type TranscriptKind } from "./transcript-projection";
import type { SessionSummary } from "./runtime";

export type SessionStatus = "idle" | "active" | "running" | "waiting" | "failed" | "completed" | "disconnected";
export type StatusTone = "muted" | "info" | "success" | "warning" | "danger";
export type DisplayDensity = "compact" | "comfortable" | "debug";

export interface WorktreeSummary {
	readonly id: string;
	readonly label: string;
	readonly branch?: string;
	readonly path?: string;
	readonly insertions?: number;
	readonly deletions?: number;
	readonly dirtyFiles?: number;
	readonly activeSessionIds: readonly string[];
}

export interface TranscriptItem {
	readonly id: string;
	readonly type: "message" | "tool" | "approval" | "diff" | "terminal" | "error" | "debug";
	readonly kind: TranscriptKind;
	readonly sessionId?: string;
	readonly title: string;
	readonly summary: string;
	readonly timestamp?: string;
	readonly expandable: boolean;
	readonly raw: unknown;
	readonly containsSensitiveRaw?: boolean;
}

export interface ApprovalItem {
	readonly id: string;
	readonly sessionId?: string;
	readonly summary: string;
	readonly risk: "low" | "medium" | "high";
	readonly scope: string;
}

export interface ProviderStatus {
	readonly provider: string;
	readonly authenticated: boolean;
	readonly status: "ready" | "missing-auth" | "env-key" | "oauth" | "unavailable" | "error" | "unknown";
	readonly authMethod?: "oauth" | "api-key" | "env" | "config";
	readonly actionable?: boolean;
	readonly canLogin?: boolean;
	readonly canLogout?: boolean;
	readonly canRelogin?: boolean;
	readonly instruction?: string;
	readonly message?: string;
	readonly source?: string;
	readonly version?: string;
	readonly modelCount?: number;
}

export interface DiffSummary {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

export function statusTone(status: string | undefined): StatusTone {
	switch (status) {
		case "running":
		case "active":
			return "info";
		case "waiting":
		case "waiting_for_approval":
			return "warning";
		case "failed":
		case "error":
			return "danger";
		case "completed":
		case "done":
			return "success";
		default:
			return "muted";
	}
}

export function activeSessions(sessions: readonly SessionSummary[]): SessionSummary[] {
	return sessions.filter((session) =>
		["active", "running", "waiting", "waiting_for_approval"].includes(session.status),
	);
}

export function approvalCount(approvals: readonly ApprovalItem[], sessionId?: string): number {
	return approvals.filter((approval) => !sessionId || approval.sessionId === sessionId).length;
}

export function diffSummary(worktrees: readonly WorktreeSummary[]): DiffSummary {
	return worktrees.reduce(
		(summary, worktree) => ({
			files: summary.files + (worktree.dirtyFiles ?? 0),
			insertions: summary.insertions + (worktree.insertions ?? 0),
			deletions: summary.deletions + (worktree.deletions ?? 0),
		}),
		{ files: 0, insertions: 0, deletions: 0 },
	);
}

export function transcriptItemFromEvent(event: AppEvent): TranscriptItem[] {
	return projectTranscriptEvent(event).map((row) => ({
		id: row.id,
		type: transcriptType(row.kind),
		kind: row.kind,
		sessionId: row.sessionId,
		title: row.title,
		summary: row.summary,
		timestamp: row.timestamp,
		expandable: row.kind === "debug" || row.containsSensitiveRaw === true,
		raw: row.raw,
		containsSensitiveRaw: row.containsSensitiveRaw,
	}));
}

export function transcriptItemsFromEvents(events: readonly AppEvent[]): TranscriptItem[] {
	return events.flatMap(transcriptItemFromEvent);
}

export function approvalItemFromPayload(payload: unknown, fallbackSessionId?: string): ApprovalItem | undefined {
	if (!payload || typeof payload !== "object") return undefined;
	const value = payload as {
		approvalId?: unknown;
		id?: unknown;
		sessionId?: unknown;
		summary?: unknown;
		risk?: unknown;
		scope?: unknown;
		request?: unknown;
	};
	const id =
		typeof value.approvalId === "string" ? value.approvalId : typeof value.id === "string" ? value.id : undefined;
	if (!id) return undefined;
	const sessionId = typeof value.sessionId === "string" ? value.sessionId : fallbackSessionId;
	const summary = typeof value.summary === "string" ? value.summary : payloadSummary(value.request ?? payload);
	const risk =
		value.risk === "low" || value.risk === "medium" || value.risk === "high"
			? value.risk
			: inferApprovalRisk(summary);
	const scope = typeof value.scope === "string" ? value.scope : inferApprovalScope(value.request ?? summary);
	return { id, sessionId, summary, risk, scope };
}

function transcriptType(kind: TranscriptKind): TranscriptItem["type"] {
	if (kind === "approval") return "approval";
	if (kind === "diff") return "diff";
	if (kind === "terminal") return "terminal";
	if (kind === "error") return "error";
	if (kind === "tool" || kind === "bash" || kind === "skill") return "tool";
	if (kind === "debug") return "debug";
	return "message";
}

function transcriptTitle(type: string): string {
	return type
		.split("/")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).replaceAll("_", " "))
		.join(" · ");
}

function payloadSummary(payload: unknown): string {
	if (typeof payload === "string") return payload;
	if (!payload || typeof payload !== "object") return payload == null ? "" : String(payload);
	const value = payload as { summary?: unknown; message?: unknown; command?: unknown; path?: unknown };
	for (const candidate of [value.summary, value.message, value.command, value.path]) {
		if (typeof candidate === "string" && candidate.length > 0) return candidate;
	}
	return JSON.stringify(payload);
}

function inferApprovalRisk(summary: string): ApprovalItem["risk"] {
	const text = summary.toLowerCase();
	if (text.includes("delete") || text.includes("rm ") || text.includes("force") || text.includes("sudo"))
		return "high";
	if (text.includes("write") || text.includes("edit") || text.includes("commit")) return "medium";
	return "low";
}

function inferApprovalScope(request: unknown): string {
	if (typeof request === "string") return request;
	if (!request || typeof request !== "object") return "workspace";
	const value = request as { scope?: unknown; command?: unknown; path?: unknown };
	if (typeof value.scope === "string") return value.scope;
	if (typeof value.path === "string") return value.path;
	if (typeof value.command === "string") return value.command;
	return "workspace";
}


export function accessModeLabel(mode: AccessMode): string {
	switch (mode) {
		case "supervised":
			return "Supervised";
		case "auto-accept":
			return "Auto-accept";
		case "unrestricted":
			return "Unrestricted · audited · hard blocks remain";
	}
}

export function terminalStatusTone(status: string | undefined): StatusTone {
	switch (status) {
		case "running":
		case "starting":
			return "info";
		case "exited":
			return "success";
		case "killed":
			return "warning";
		case "error":
			return "danger";
		default:
			return "muted";
	}
}
