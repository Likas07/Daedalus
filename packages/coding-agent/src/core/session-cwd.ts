import { existsSync, realpathSync } from "node:fs";
import type { WorkspaceResumeDiagnostic, WorkspaceResumeStatus, WorkspaceSessionIdentity } from "./workspaces/types.js";
import type { WorkspaceService } from "./workspaces/workspace-service.js";

export interface SessionCwdIssue {
	sessionFile?: string;
	sessionCwd: string;
	fallbackCwd: string;
}

interface SessionCwdSource {
	getCwd(): string;
	getSessionFile(): string | undefined;
	getWorkspaceIdentity?(): WorkspaceSessionIdentity | undefined;
}

export type WorkspaceResumeIssueCode =
	| "missing_cwd"
	| "legacy_unknown"
	| "canonical_path_mismatch"
	| "missing_worktree"
	| "branch_mismatch"
	| "project_mismatch";

export interface WorkspaceResumeSafetyIssue extends Omit<WorkspaceResumeDiagnostic, "status"> {
	code: WorkspaceResumeIssueCode;
	status: WorkspaceResumeStatus | "legacy_unknown";
	sessionFile?: string;
	recovery: "choose_cwd" | "adopt_workspace" | "restore_workspace" | "switch_branch" | "open_project";
}

export interface WorkspaceResumeSafetyDiagnostic {
	ok: boolean;
	sessionFile?: string;
	sessionCwd: string;
	fallbackCwd: string;
	workspaceIdentity?: WorkspaceSessionIdentity;
	issues: WorkspaceResumeSafetyIssue[];
}

function canonicalIfExists(path: string): string | undefined {
	try {
		return existsSync(path) ? realpathSync(path) : undefined;
	} catch {
		return undefined;
	}
}

export function getWorkspaceResumeSafetyDiagnostic(
	sessionManager: SessionCwdSource,
	fallbackCwd: string,
	workspaceService?: WorkspaceService,
): WorkspaceResumeSafetyDiagnostic | undefined {
	const sessionFile = sessionManager.getSessionFile();
	if (!sessionFile) return undefined;

	const sessionCwd = sessionManager.getCwd();
	const workspaceIdentity = sessionManager.getWorkspaceIdentity?.();
	const issues: WorkspaceResumeSafetyIssue[] = [];
	const sessionReal = canonicalIfExists(sessionCwd);
	const fallbackReal = canonicalIfExists(fallbackCwd);

	if (!sessionReal) {
		issues.push({
			code: "missing_cwd",
			status: "workspace_missing",
			message: "Stored session working directory does not exist",
			expectedCwd: sessionCwd,
			actualCwd: fallbackCwd,
			sessionFile,
			recovery: "choose_cwd",
		});
	}

	if (!workspaceIdentity) {
		issues.push({
			code: "legacy_unknown",
			status: "legacy_unknown",
			message: "Session has no workspace identity; resume requires explicit adoption",
			expectedCwd: sessionCwd,
			actualCwd: fallbackCwd,
			sessionFile,
			recovery: "adopt_workspace",
		});
	} else {
		const target = workspaceIdentity.workspace;
		if (sessionReal && target.cwd && canonicalIfExists(target.cwd) && canonicalIfExists(target.cwd) !== sessionReal) {
			issues.push({
				code: "canonical_path_mismatch",
				status: "cwd_mismatch",
				message: "Session cwd does not match workspace identity cwd",
				expectedCwd: target.cwd,
				actualCwd: sessionCwd,
				workspace: target,
				sessionFile,
				recovery: "adopt_workspace",
			});
		}
		if (
			target.projectRoot &&
			workspaceService?.projectRoot &&
			canonicalIfExists(target.projectRoot) !== canonicalIfExists(workspaceService.projectRoot)
		) {
			issues.push({
				code: "project_mismatch",
				status: "invalid",
				message: "Session workspace belongs to a different project",
				expectedCwd: target.projectRoot,
				actualCwd: workspaceService.projectRoot,
				workspace: target,
				sessionFile,
				recovery: "open_project",
			});
		}
		if (workspaceService) {
			const validation = workspaceService.validateTarget(target);
			if (!validation.valid) {
				const code: WorkspaceResumeIssueCode =
					validation.status === "workspace_missing"
						? "missing_worktree"
						: validation.message?.toLowerCase().includes("branch")
							? "branch_mismatch"
							: "canonical_path_mismatch";
				issues.push({
					code,
					status: validation.status,
					message: validation.message,
					expectedCwd: target.cwd,
					actualCwd: validation.actualCwd,
					workspace: target,
					sessionFile,
					recovery: code === "branch_mismatch" ? "switch_branch" : "restore_workspace",
				});
			}
		}
	}

	if (sessionReal && fallbackReal && sessionReal !== fallbackReal && !workspaceIdentity) {
		// Legacy sessions cannot prove whether this cwd mismatch is safe.
	}

	return { ok: issues.length === 0, sessionFile, sessionCwd, fallbackCwd, workspaceIdentity, issues };
}

export function getMissingSessionCwdIssue(
	sessionManager: SessionCwdSource,
	fallbackCwd: string,
): SessionCwdIssue | undefined {
	const diagnostic = getWorkspaceResumeSafetyDiagnostic(sessionManager, fallbackCwd);
	const issue = diagnostic?.issues.find((candidate) => candidate.code === "missing_cwd");
	return issue && diagnostic
		? { sessionFile: issue.sessionFile, sessionCwd: issue.expectedCwd ?? diagnostic.sessionCwd, fallbackCwd }
		: undefined;
}

export function formatMissingSessionCwdError(issue: SessionCwdIssue): string {
	const sessionFile = issue.sessionFile ? `\nSession file: ${issue.sessionFile}` : "";
	return `Stored session working directory does not exist: ${issue.sessionCwd}${sessionFile}\nCurrent working directory: ${issue.fallbackCwd}`;
}

export function formatMissingSessionCwdPrompt(issue: SessionCwdIssue): string {
	return `cwd from session file does not exist\n${issue.sessionCwd}\n\ncontinue in current cwd\n${issue.fallbackCwd}`;
}

export function formatWorkspaceResumeSafetyError(diagnostic: WorkspaceResumeSafetyDiagnostic): string {
	return diagnostic.issues
		.map((issue) => `${issue.code}: ${issue.message ?? "Workspace resume is unsafe"}`)
		.join("\n");
}

export class MissingSessionCwdError extends Error {
	readonly issue: SessionCwdIssue;

	constructor(issue: SessionCwdIssue) {
		super(formatMissingSessionCwdError(issue));
		this.name = "MissingSessionCwdError";
		this.issue = issue;
	}
}

export class WorkspaceResumeSafetyError extends MissingSessionCwdError {
	readonly diagnostic: WorkspaceResumeSafetyDiagnostic;

	constructor(diagnostic: WorkspaceResumeSafetyDiagnostic) {
		const missing = diagnostic.issues.find((issue) => issue.code === "missing_cwd");
		super({
			sessionFile: diagnostic.sessionFile,
			sessionCwd: missing?.expectedCwd ?? diagnostic.sessionCwd,
			fallbackCwd: diagnostic.fallbackCwd,
		});
		this.name = "WorkspaceResumeSafetyError";
		this.message = formatWorkspaceResumeSafetyError(diagnostic);
		this.diagnostic = diagnostic;
	}
}

export function assertSessionCwdExists(sessionManager: SessionCwdSource, fallbackCwd: string): void {
	const issue = getMissingSessionCwdIssue(sessionManager, fallbackCwd);
	if (issue) throw new MissingSessionCwdError(issue);
}

export function assertWorkspaceResumeSafe(
	sessionManager: SessionCwdSource,
	fallbackCwd: string,
	workspaceService?: WorkspaceService,
): void {
	const diagnostic = getWorkspaceResumeSafetyDiagnostic(sessionManager, fallbackCwd, workspaceService);
	if (diagnostic && !diagnostic.ok) throw new WorkspaceResumeSafetyError(diagnostic);
}
