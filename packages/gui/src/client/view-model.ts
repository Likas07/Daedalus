import type { AppEvent } from "@daedalus-pi/app-server-protocol";
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
	readonly sessionId?: string;
	readonly title: string;
	readonly summary: string;
	readonly timestamp?: string;
	readonly expandable: boolean;
	readonly raw: unknown;
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
	readonly status: "ready" | "missing-auth" | "unavailable" | "unknown";
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

export function transcriptItemFromEvent(event: AppEvent): TranscriptItem {
	const type = transcriptType(event.type);
	return {
		id: event.id,
		type,
		sessionId: event.sessionId,
		title: transcriptTitle(event.type),
		summary: payloadSummary(event.payload),
		timestamp: event.ts,
		expandable: event.payload !== undefined && event.payload !== null,
		raw: event,
	};
}

export function transcriptItemsFromEvents(events: readonly AppEvent[]): TranscriptItem[] {
	return events.map(transcriptItemFromEvent);
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

function transcriptType(type: string): TranscriptItem["type"] {
	if (type.startsWith("approval/")) return "approval";
	if (type.startsWith("diff/")) return "diff";
	if (type.startsWith("terminal/")) return "terminal";
	if (type.includes("error") || type.includes("diagnostic")) return "error";
	if (type.includes("tool")) return "tool";
	if (type.includes("debug")) return "debug";
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
