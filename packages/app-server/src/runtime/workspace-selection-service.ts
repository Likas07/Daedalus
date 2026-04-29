import type { RestorationTrace, WorkspaceSelectionResult } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../persistence/database";

interface SelectionRow {
	readonly project_id: string;
	readonly session_id: string | null;
	readonly updated_at: string;
}

interface SessionProjectRow {
	readonly project_id: string | null;
	readonly runs_in_json: string | null;
	readonly validation_status: string | null;
}

export interface WorkspaceSelectionServiceOptions {
	readonly database: AppServerDatabase;
}

export class WorkspaceSelectionService {
	constructor(private readonly options: WorkspaceSelectionServiceOptions) {}
	private latestRestorationTrace: RestorationTrace | undefined;

	lastRestorationTrace(): RestorationTrace | undefined {
		return this.latestRestorationTrace;
	}

	get(projectId: string): WorkspaceSelectionResult {
		this.requireProject(projectId);
		let row: SelectionRow | undefined;
		try {
			row = this.options.database
				.query<SelectionRow, [string]>(
					"SELECT project_id, session_id, updated_at FROM workspace_active_selection WHERE project_id = ?",
				)
				.get(projectId) ?? undefined;
		} catch (error) {
			const restorationTrace = this.trace(projectId, "failed", `Failed to read workspace selection: ${messageOf(error)}`);
			return { degraded: true, reason: restorationTrace.reason, restorationTrace };
		}
		if (!row?.session_id) return { degraded: false, restorationTrace: this.trace(projectId, "missing", "No active workspace selection pointer") };
		const requestedSelection = { projectId: row.project_id, sessionId: row.session_id, updatedAt: row.updated_at };
		const session = this.sessionProject(row.session_id);
		if (!session) return this.degradeAndClear(projectId, row.session_id, `Selected session is stale: ${row.session_id}`, "missing", requestedSelection);
		if (session.project_id !== projectId)
			return this.degradeAndClear(
				projectId,
				row.session_id,
				`Selected session ${row.session_id} does not belong to project ${projectId}`,
				"mismatched",
				requestedSelection,
			);
		if (!session.runs_in_json)
			return this.degradeAndClear(projectId, row.session_id, `Selected session ${row.session_id} has no runtime target`, "degraded", requestedSelection);
		if (session.validation_status && session.validation_status !== "valid")
			return this.degradeAndClear(projectId, row.session_id, `Selected session ${row.session_id} target is ${session.validation_status}`, "degraded", requestedSelection);
		return {
			selection: { projectId, sessionId: row.session_id, updatedAt: row.updated_at },
			degraded: false,
			restorationTrace: this.trace(projectId, "restored", "Restored active workspace selection", requestedSelection, row.session_id),
		};
	}

	set(input: { projectId: string; sessionId?: string }): WorkspaceSelectionResult {
		this.requireProject(input.projectId);
		if (!input.sessionId) {
			this.clear(input.projectId);
			return { degraded: false };
		}
		this.requireSessionInProject(input.projectId, input.sessionId);
		return this.persist(input.projectId, input.sessionId);
	}

	setValidated(input: { projectId: string; sessionId: string }): WorkspaceSelectionResult {
		this.requireProject(input.projectId);
		this.requireSessionInProject(input.projectId, input.sessionId);
		return this.persist(input.projectId, input.sessionId);
	}

	private persist(projectId: string, sessionId: string): WorkspaceSelectionResult {
		const updatedAt = new Date().toISOString();
		this.options.database
			.query(
				`INSERT INTO workspace_active_selection (project_id, session_id, updated_at)
				 VALUES (?, ?, ?)
				 ON CONFLICT(project_id) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at`,
			)
			.run(projectId, sessionId, updatedAt);
		const selection = { projectId, sessionId, updatedAt };
		return {
			selection,
			degraded: false,
			restorationTrace: this.trace(projectId, "restored", "Persisted active workspace selection", selection, sessionId),
		};
	}

	private clear(projectId: string): void {
		this.options.database.query("DELETE FROM workspace_active_selection WHERE project_id = ?").run(projectId);
	}

	private requireProject(projectId: string): void {
		const row = this.options.database
			.query<{ id: string }, [string]>("SELECT id FROM projects WHERE id = ?")
			.get(projectId);
		if (!row) throw new Error(`Unknown project: ${projectId}`);
	}



	private requireSessionInProject(projectId: string, sessionId: string): void {
		const session = this.sessionProject(sessionId);
		if (!session) throw new Error(`Unknown session: ${sessionId}`);
		if (session.project_id !== projectId)
			throw new Error(`Session ${sessionId} does not belong to project ${projectId}`);
	}

	private degradeAndClear(
		projectId: string,
		sessionId: string,
		reason: string,
		status: RestorationTrace["status"],
		requestedSelection: unknown,
	): WorkspaceSelectionResult {
		let clearReason = reason;
		try {
			this.clear(projectId);
		} catch (error) {
			clearReason = `${reason}; failed to clear stale pointer: ${messageOf(error)}`;
		}
		return {
			degraded: true,
			reason: clearReason,
			restorationTrace: this.trace(projectId, status, clearReason, requestedSelection, sessionId),
		};
	}

	private trace(
		projectId: string,
		status: RestorationTrace["status"],
		reason?: string,
		requestedSelection?: unknown,
		resolvedSession?: string,
	): RestorationTrace {
		this.latestRestorationTrace = { projectId, status, reason, requestedSelection, resolvedSession, checkedAt: new Date().toISOString() };
		return this.latestRestorationTrace;
	}

	private sessionProject(sessionId: string): SessionProjectRow | undefined {
		return (
			this.options.database
				.query<SessionProjectRow, [string]>("SELECT project_id, runs_in_json, validation_status FROM sessions WHERE id = ?")
				.get(sessionId) ?? undefined
		);
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
