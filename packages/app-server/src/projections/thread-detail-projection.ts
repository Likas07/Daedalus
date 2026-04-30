import type {
	ThreadActivity,
	ThreadDetailSnapshot,
	ThreadMessage,
	ThreadPendingAction,
} from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../persistence/database";
import { listActiveApprovals, listSessionTurns, listTerminalSessions } from "../persistence/read-model";
import { cursor } from "./shell-projection";

export interface BuildThreadDetailSnapshotOptions {
	readonly database: AppServerDatabase;
	readonly threadId: string;
	readonly sessionId?: string;
}

export function buildThreadDetailSnapshot(options: BuildThreadDetailSnapshotOptions): ThreadDetailSnapshot {
	const sessionId = options.sessionId ?? options.threadId;
	const session = options.database
		.query<
			{
				id: string;
				project_id: string | null;
				worktree_id: string | null;
				status: string;
				title: string | null;
				updated_at: string;
				validation_status: string | null;
				needs_attention_reason: string | null;
			},
			[string]
		>(
			"SELECT id, project_id, worktree_id, status, title, updated_at, validation_status, needs_attention_reason FROM sessions WHERE id = ?",
		)
		.get(sessionId);
	if (!session) throw new Error(`Unknown thread: ${options.threadId}`);
	const turns = listSessionTurns(options.database, sessionId);
	const approvals = listActiveApprovals(options.database, sessionId);
	const terminals = listTerminalSessions(options.database, session.project_id ?? undefined).filter(
		(terminal) => !session.worktree_id || terminal.worktreeId === session.worktree_id,
	);
	const messages: ThreadMessage[] = turns.map((turn) => ({
		id: turn.id,
		turnId: turn.id,
		role: role(turn.role),
		content: turn.content,
		createdAt: turn.createdAt,
	}));
	const pendingActions: ThreadPendingAction[] = approvals.map((approval) => ({
		id: approval.id,
		kind: "approval",
		title: approvalTitle(approval.request),
		summary: approval.request,
		approvalId: approval.id,
	}));
	const activity: ThreadActivity[] = [
		...approvals.map((approval) => ({
			id: approval.id,
			kind: "approval" as const,
			status: "running" as const,
			title: approvalTitle(approval.request),
			detail: approval.request,
			startedAt: approval.createdAt,
		})),
		...terminals.map((terminal) => ({
			id: terminal.id,
			kind: "terminal" as const,
			status: terminal.status === "running" ? ("running" as const) : ("completed" as const),
			title: `Terminal: ${terminal.shell || terminal.cwd}`,
			detail: terminal.cwd,
			startedAt: terminal.createdAt,
			completedAt: terminal.status === "running" ? undefined : terminal.updatedAt,
		})),
	];
	const safetySignals = [];
	if (session.needs_attention_reason)
		safetySignals.push({
			level: "warning" as const,
			message: session.needs_attention_reason,
			code: "needs-attention",
		});
	if (session.validation_status && session.validation_status !== "valid")
		safetySignals.push({
			level: "warning" as const,
			message: `Target state is ${session.validation_status}`,
			code: "target-validation",
		});
	return {
		cursor: cursor(options.database),
		threadId: options.threadId,
		sessionId,
		projectId: session.project_id ?? undefined,
		worktreeId: session.worktree_id ?? undefined,
		title: session.title ?? messages.find((m) => m.role === "user")?.content.slice(0, 80) ?? "Untitled Thread",
		status: mapStatus(session.status, pendingActions.length),
		messages,
		activity,
		pendingActions,
		safetySignals,
		diffIds: [session.worktree_id ?? session.project_id].filter((id): id is string => !!id),
	};
}

function role(value: string): ThreadMessage["role"] {
	return value === "user" || value === "system" || value === "tool" ? value : "assistant";
}
function mapStatus(status: string, pending: number): ThreadDetailSnapshot["status"] {
	if (pending > 0 || status === "waiting_for_approval") return "waiting";
	if (["active", "running"].includes(status)) return "running";
	if (["failed", "needs-attention"].includes(status)) return "failed";
	if (["completed", "done"].includes(status)) return "completed";
	return "idle";
}
function approvalTitle(raw: string): string {
	try {
		const value = JSON.parse(raw) as { summary?: string; action?: string };
		return value.summary ?? value.action ?? "Approval required";
	} catch {
		return raw.slice(0, 80) || "Approval required";
	}
}
