import type { WorkspaceSelectionResult } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../persistence/database";

interface SelectionRow {
	readonly project_id: string;
	readonly session_id: string | null;
	readonly updated_at: string;
}

interface SessionProjectRow {
	readonly project_id: string | null;
}

export interface WorkspaceSelectionServiceOptions {
	readonly database: AppServerDatabase;
}

export class WorkspaceSelectionService {
	constructor(private readonly options: WorkspaceSelectionServiceOptions) {}

	get(projectId: string): WorkspaceSelectionResult {
		this.requireProject(projectId);
		const row = this.options.database
			.query<SelectionRow, [string]>(
				"SELECT project_id, session_id, updated_at FROM workspace_active_selection WHERE project_id = ?",
			)
			.get(projectId);
		if (!row?.session_id) return { degraded: false };
		const session = this.sessionProject(row.session_id);
		if (!session) {
			this.clear(projectId);
			return { degraded: true, reason: `Selected session is stale: ${row.session_id}` };
		}
		if (session.project_id !== projectId) {
			this.clear(projectId);
			return {
				degraded: true,
				reason: `Selected session ${row.session_id} does not belong to project ${projectId}`,
			};
		}
		return { selection: { projectId, sessionId: row.session_id, updatedAt: row.updated_at }, degraded: false };
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
		this.ensureSessionPointer(input.projectId, input.sessionId);
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
		return { selection: { projectId, sessionId, updatedAt }, degraded: false };
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

	private ensureSessionPointer(projectId: string, sessionId: string): void {
		const existing = this.sessionProject(sessionId);
		if (existing) {
			if (existing.project_id !== projectId)
				throw new Error(`Session ${sessionId} does not belong to project ${projectId}`);
			return;
		}
		const now = new Date().toISOString();
		this.options.database
			.query(
				`INSERT INTO sessions (id, project_id, status, created_at, updated_at)
				 VALUES (?, ?, 'active', ?, ?)`,
			)
			.run(sessionId, projectId, now, now);
	}

	private requireSessionInProject(projectId: string, sessionId: string): void {
		const session = this.sessionProject(sessionId);
		if (!session) throw new Error(`Unknown session: ${sessionId}`);
		if (session.project_id !== projectId)
			throw new Error(`Session ${sessionId} does not belong to project ${projectId}`);
	}

	private sessionProject(sessionId: string): SessionProjectRow | undefined {
		return (
			this.options.database
				.query<SessionProjectRow, [string]>("SELECT project_id FROM sessions WHERE id = ?")
				.get(sessionId) ?? undefined
		);
	}
}
