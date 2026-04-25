import type { AppServerDatabase } from "./database";

export interface ProjectReadModel {
	readonly id: string;
	readonly name: string;
	readonly path: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface WorktreeReadModel {
	readonly id: string;
	readonly projectId: string;
	readonly path: string;
	readonly branch: string | null;
	readonly baseBranch: string | null;
	readonly status: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface SessionReadModel {
	readonly id: string;
	readonly projectId: string | null;
	readonly worktreeId: string | null;
	readonly status: string;
	readonly title: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface TurnReadModel {
	readonly id: string;
	readonly sessionId: string;
	readonly role: string;
	readonly content: string;
	readonly createdAt: string;
}

export interface ApprovalReadModel {
	readonly id: string;
	readonly sessionId: string | null;
	readonly status: string;
	readonly request: string;
	readonly response: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface TerminalSessionReadModel {
	readonly id: string;
	readonly projectId: string | null;
	readonly worktreeId: string | null;
	readonly status: string;
	readonly cwd: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface IntegrationResourceReadModel {
	readonly id: string;
	readonly provider: string;
	readonly resourceType: string;
	readonly externalId: string;
	readonly data: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

interface ProjectRow {
	readonly id: string;
	readonly name: string;
	readonly path: string;
	readonly created_at: string;
	readonly updated_at: string;
}
interface WorktreeRow {
	readonly id: string;
	readonly project_id: string;
	readonly path: string;
	readonly branch: string | null;
	readonly base_branch: string | null;
	readonly status: string;
	readonly created_at: string;
	readonly updated_at: string;
}
interface SessionRow {
	readonly id: string;
	readonly project_id: string | null;
	readonly worktree_id: string | null;
	readonly status: string;
	readonly title: string | null;
	readonly created_at: string;
	readonly updated_at: string;
}
interface TurnRow {
	readonly id: string;
	readonly session_id: string;
	readonly role: string;
	readonly content: string;
	readonly created_at: string;
}
interface ApprovalRow {
	readonly id: string;
	readonly session_id: string | null;
	readonly status: string;
	readonly request: string;
	readonly response: string | null;
	readonly created_at: string;
	readonly updated_at: string;
}
interface TerminalSessionRow {
	readonly id: string;
	readonly project_id: string | null;
	readonly worktree_id: string | null;
	readonly status: string;
	readonly cwd: string;
	readonly created_at: string;
	readonly updated_at: string;
}
interface IntegrationResourceRow {
	readonly id: string;
	readonly provider: string;
	readonly resource_type: string;
	readonly external_id: string;
	readonly data: string;
	readonly created_at: string;
	readonly updated_at: string;
}

export function listProjects(database: AppServerDatabase): ProjectReadModel[] {
	return database
		.query<ProjectRow, []>("SELECT * FROM projects ORDER BY updated_at DESC, id ASC")
		.all()
		.map(mapProject);
}

export function listProjectSessions(database: AppServerDatabase, projectId: string): SessionReadModel[] {
	return database
		.query<SessionRow, [string]>("SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC, id ASC")
		.all(projectId)
		.map(mapSession);
}

export function listActiveApprovals(database: AppServerDatabase, sessionId?: string): ApprovalReadModel[] {
	const rows = sessionId
		? database
				.query<ApprovalRow, [string]>(
					"SELECT * FROM approvals WHERE status = 'pending' AND session_id = ? ORDER BY created_at ASC, id ASC",
				)
				.all(sessionId)
		: database
				.query<ApprovalRow, []>("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC, id ASC")
				.all();
	return rows.map(mapApproval);
}

export function listSessionTurns(database: AppServerDatabase, sessionId: string): TurnReadModel[] {
	return database
		.query<TurnRow, [string]>("SELECT * FROM turns WHERE session_id = ? ORDER BY created_at ASC, id ASC")
		.all(sessionId)
		.map(mapTurn);
}

export function listTerminalSessions(database: AppServerDatabase, projectId?: string): TerminalSessionReadModel[] {
	const rows = projectId
		? database
				.query<TerminalSessionRow, [string]>(
					"SELECT * FROM terminal_sessions WHERE project_id = ? ORDER BY updated_at DESC, id ASC",
				)
				.all(projectId)
		: database
				.query<TerminalSessionRow, []>("SELECT * FROM terminal_sessions ORDER BY updated_at DESC, id ASC")
				.all();
	return rows.map(mapTerminalSession);
}

export function listWorktrees(database: AppServerDatabase, projectId?: string): WorktreeReadModel[] {
	const rows = projectId
		? database
				.query<WorktreeRow, [string]>(
					"SELECT * FROM worktrees WHERE project_id = ? ORDER BY updated_at DESC, id ASC",
				)
				.all(projectId)
		: database.query<WorktreeRow, []>("SELECT * FROM worktrees ORDER BY updated_at DESC, id ASC").all();
	return rows.map(mapWorktree);
}

export function listIntegrationResources(
	database: AppServerDatabase,
	provider?: string,
): IntegrationResourceReadModel[] {
	const rows = provider
		? database
				.query<IntegrationResourceRow, [string]>(
					"SELECT * FROM integration_resources WHERE provider = ? ORDER BY updated_at DESC, id ASC",
				)
				.all(provider)
		: database
				.query<IntegrationResourceRow, []>("SELECT * FROM integration_resources ORDER BY updated_at DESC, id ASC")
				.all();
	return rows.map(mapIntegrationResource);
}

const mapProject = (row: ProjectRow): ProjectReadModel => ({
	id: row.id,
	name: row.name,
	path: row.path,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});
const mapWorktree = (row: WorktreeRow): WorktreeReadModel => ({
	id: row.id,
	projectId: row.project_id,
	path: row.path,
	branch: row.branch,
	baseBranch: row.base_branch,
	status: row.status,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});
const mapSession = (row: SessionRow): SessionReadModel => ({
	id: row.id,
	projectId: row.project_id,
	worktreeId: row.worktree_id,
	status: row.status,
	title: row.title,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});
const mapTurn = (row: TurnRow): TurnReadModel => ({
	id: row.id,
	sessionId: row.session_id,
	role: row.role,
	content: row.content,
	createdAt: row.created_at,
});
const mapApproval = (row: ApprovalRow): ApprovalReadModel => ({
	id: row.id,
	sessionId: row.session_id,
	status: row.status,
	request: row.request,
	response: row.response,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});
const mapTerminalSession = (row: TerminalSessionRow): TerminalSessionReadModel => ({
	id: row.id,
	projectId: row.project_id,
	worktreeId: row.worktree_id,
	status: row.status,
	cwd: row.cwd,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});
const mapIntegrationResource = (row: IntegrationResourceRow): IntegrationResourceReadModel => ({
	id: row.id,
	provider: row.provider,
	resourceType: row.resource_type,
	externalId: row.external_id,
	data: row.data,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});
