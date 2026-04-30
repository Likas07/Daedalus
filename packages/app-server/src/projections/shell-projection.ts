import type { ShellSnapshot, ShellThreadSummary } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../persistence/database";
import {
	listActiveApprovals,
	listProjectSessions,
	listProjects,
	listSessionTurns,
	listWorktrees,
} from "../persistence/read-model";

export interface BuildShellSnapshotOptions {
	readonly database: AppServerDatabase;
	readonly projectId?: string;
}

export function buildShellSnapshot(options: BuildShellSnapshotOptions): ShellSnapshot {
	const { database, projectId } = options;
	const projects = listProjects(database).filter((project) => !projectId || project.id === projectId);
	const projectIds = new Set(projects.map((project) => project.id));
	const worktrees = new Map(listWorktrees(database).map((worktree) => [worktree.id, worktree]));
	const approvals = listActiveApprovals(database);
	const pendingBySession = new Map<string, number>();
	for (const approval of approvals)
		if (approval.sessionId)
			pendingBySession.set(approval.sessionId, (pendingBySession.get(approval.sessionId) ?? 0) + 1);
	const threads: ShellThreadSummary[] = [];
	for (const project of projects) {
		for (const session of listProjectSessions(database, project.id)) {
			const turns = listSessionTurns(database, session.id);
			const last = turns.at(-1);
			const pendingActionCount = pendingBySession.get(session.id) ?? 0;
			const safetySignals = [];
			if (session.needsAttentionReason)
				safetySignals.push({
					level: "warning" as const,
					message: session.needsAttentionReason,
					code: "needs-attention",
				});
			if (session.validationStatus && session.validationStatus !== "valid")
				safetySignals.push({
					level: "warning" as const,
					message: `Target state is ${session.validationStatus}`,
					code: "target-validation",
				});
			if (session.runsIn?.isolationMode === "base-checkout")
				safetySignals.push({ level: "warning" as const, message: "Runs in Base checkout", code: "base-checkout" });
			if (pendingActionCount > 0)
				safetySignals.push({
					level: "info" as const,
					message: `${pendingActionCount} pending approval${pendingActionCount === 1 ? "" : "s"}`,
					code: "pending-approval",
				});
			const worktree = session.worktreeId ? worktrees.get(session.worktreeId) : undefined;
			threads.push({
				threadId: session.id,
				sessionId: session.id,
				projectId: session.projectId ?? undefined,
				worktreeId: session.worktreeId ?? undefined,
				title:
					session.title ??
					last?.content.slice(0, 80) ??
					targetLabel(session.runsIn, worktree?.branch) ??
					"Untitled Thread",
				status: mapStatus(session.status, pendingActionCount),
				lastMessage: last?.content || undefined,
				updatedAt: session.updatedAt,
				pendingActionCount,
				safetySignals,
			});
		}
	}
	const selectedThreadId = selectedSession(database, projectId, projectIds);
	return {
		cursor: cursor(database),
		threads: threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.threadId.localeCompare(b.threadId)),
		selectedThreadId,
	};
}

function selectedSession(
	database: AppServerDatabase,
	projectId: string | undefined,
	projectIds: Set<string>,
): string | undefined {
	const rows = projectId
		? database
				.query<{ session_id: string | null }, [string]>(
					"SELECT session_id FROM workspace_active_selection WHERE project_id = ?",
				)
				.all(projectId)
		: database
				.query<{ session_id: string | null; project_id: string }, []>(
					"SELECT project_id, session_id FROM workspace_active_selection ORDER BY updated_at DESC",
				)
				.all();
	for (const row of rows as Array<{ session_id: string | null; project_id?: string }>)
		if (row.session_id && (!row.project_id || projectIds.has(row.project_id))) return row.session_id;
	return undefined;
}

function targetLabel(
	runsIn: { isolationMode?: string; branch?: string | null } | null,
	worktreeBranch?: string | null,
): string | undefined {
	if (!runsIn) return undefined;
	return runsIn.isolationMode === "base-checkout"
		? `Base: ${runsIn.branch ?? "checkout"}`
		: `Worktree: ${worktreeBranch ?? runsIn.branch ?? "unknown"}`;
}

function mapStatus(status: string, pending: number): ShellThreadSummary["status"] {
	if (pending > 0 || status === "waiting_for_approval") return "waiting";
	if (["active", "running"].includes(status)) return "running";
	if (["failed", "needs-attention"].includes(status)) return "failed";
	if (["completed", "done"].includes(status)) return "completed";
	return "idle";
}

export function cursor(database: AppServerDatabase): ShellSnapshot["cursor"] {
	const row = database
		.query<{ seq: number | null; updated_at: string | null }, []>(
			"SELECT max(seq) as seq, max(created_at) as updated_at FROM runtime_events",
		)
		.get();
	return { seq: row?.seq ?? 0, updatedAt: row?.updated_at ?? new Date(0).toISOString() };
}
