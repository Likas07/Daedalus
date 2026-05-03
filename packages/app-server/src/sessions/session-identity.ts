import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import type { SessionResumeIdentity, WorkflowRunsInTarget } from "@daedalus-pi/app-server-protocol";
import type { WorkspaceTarget } from "@daedalus-pi/coding-agent";
import type { AppServerDatabase } from "../persistence/database";
import { readEvents } from "../persistence/event-store";
import { projectRuntimeEvents } from "../persistence/projector";
import { gitStatus } from "../workspaces/git";
import { ProjectService } from "../workspaces/project-service";
import { assertPathWithinRoot } from "../workspaces/root-boundary";
import { WorktreeService } from "../workspaces/worktree-service";

export interface SessionIdentitySnapshot {
	readonly sessionId: string;
	readonly cwd: string;
	readonly canonicalPath: string;
	readonly projectId?: string;
	readonly worktreeId?: string;
	readonly branch?: string | null;
	readonly isolationMode?: string;
	readonly sessionFile?: string;
	readonly workspaceTarget?: WorkspaceTarget;
}

export interface VerifySessionResumeIdentityInput {
	readonly database: AppServerDatabase;
	readonly sessionId: string;
	readonly cwd: string;
	readonly sessionFile?: string;
}

export async function createSessionIdentitySnapshot(input: {
	readonly sessionId: string;
	readonly cwd: string;
	readonly sessionFile?: string;
	readonly runsIn?: WorkflowRunsInTarget;
	readonly projectId?: string;
	readonly worktreeId?: string;
	readonly workspaceTarget?: WorkspaceTarget;
}): Promise<SessionIdentitySnapshot> {
	return {
		sessionId: input.sessionId,
		cwd: input.cwd,
		canonicalPath: await canonicalPath(input.cwd, { allowMissing: true }),
		projectId:
			input.projectId ?? input.runsIn?.projectId ?? input.workspaceTarget?.projectRoot ?? input.workspaceTarget?.cwd,
		worktreeId: input.worktreeId ?? input.runsIn?.worktreeId ?? input.workspaceTarget?.id,
		branch: input.runsIn?.branch ?? input.workspaceTarget?.branch,
		isolationMode: input.runsIn?.isolationMode ?? appIsolationMode(input.workspaceTarget),
		sessionFile: input.sessionFile,
		workspaceTarget: input.workspaceTarget,
	};
}

export async function verifySessionResumeIdentity(
	input: VerifySessionResumeIdentityInput,
): Promise<SessionResumeIdentity> {
	projectRuntimeEvents(input.database);
	const stored = latestStoredIdentity(input.database, input.sessionId);
	if (!stored) {
		return mismatch(input.sessionId, "missing", "Session resume identity is missing; review before resuming.", {
			currentCwd: input.cwd,
		});
	}

	let currentCanonical: string;
	try {
		currentCanonical = await canonicalPath(input.cwd);
	} catch (error) {
		return mismatch(input.sessionId, "mismatched", `Session cwd is missing or inaccessible: ${message(error)}`, {
			storedCwd: stored.cwd,
			currentCwd: input.cwd,
			storedWorktreeId: stored.worktreeId,
		});
	}

	if (stored.sessionFile && stored.sessionFile !== input.sessionFile) {
		return mismatch(input.sessionId, "mismatched", "Session file identity does not match the stored session.", {
			storedCwd: stored.cwd,
			currentCwd: input.cwd,
			storedWorktreeId: stored.worktreeId,
		});
	}
	if (resolve(stored.cwd) !== resolve(input.cwd) || stored.canonicalPath !== currentCanonical) {
		return mismatch(input.sessionId, "mismatched", "Session cwd no longer matches the stored canonical path.", {
			storedCwd: stored.cwd,
			currentCwd: input.cwd,
			storedWorktreeId: stored.worktreeId,
		});
	}

	if (stored.projectId) {
		const project = new ProjectService({ database: input.database }).get(stored.projectId);
		if (!project)
			return mismatch(
				input.sessionId,
				"mismatched",
				`Unknown project: ${stored.projectId}`,
				fromStored(stored, input.cwd),
			);
		try {
			await assertPathWithinRoot({
				root: project.path,
				candidate: project.path,
				purpose: "session-resume-project",
				projectId: stored.projectId,
			});
		} catch (error) {
			return mismatch(input.sessionId, "mismatched", message(error), fromStored(stored, input.cwd));
		}
	}

	if (stored.worktreeId) {
		const worktree = new WorktreeService({ database: input.database }).open(stored.worktreeId);
		if (!worktree)
			return mismatch(
				input.sessionId,
				"mismatched",
				`Unknown worktree: ${stored.worktreeId}`,
				fromStored(stored, input.cwd),
			);
		if (stored.projectId && worktree.projectId !== stored.projectId) {
			return mismatch(
				input.sessionId,
				"mismatched",
				`Worktree ${stored.worktreeId} does not belong to project ${stored.projectId}`,
				fromStored(stored, input.cwd),
			);
		}
		try {
			const stat = await lstat(worktree.path);
			if (stat.isSymbolicLink()) {
				return mismatch(
					input.sessionId,
					"mismatched",
					`Worktree path is a symlink: ${worktree.path}`,
					fromStored(stored, input.cwd),
				);
			}
			const scoped = await assertPathWithinRoot({
				root: worktree.path,
				candidate: input.cwd,
				purpose: "session-resume",
				projectId: stored.projectId,
			});
			if (scoped.canonicalRootPath !== stored.canonicalPath) {
				return mismatch(
					input.sessionId,
					"mismatched",
					"Worktree canonical path does not match stored session identity.",
					fromStored(stored, input.cwd),
				);
			}
		} catch (error) {
			return mismatch(input.sessionId, "mismatched", message(error), fromStored(stored, input.cwd));
		}
	}

	if (stored.branch) {
		try {
			const status = await gitStatus(currentCanonical);
			if (status.branch && status.branch !== stored.branch) {
				return mismatch(
					input.sessionId,
					"mismatched",
					`Session branch mismatch: expected ${stored.branch}, found ${status.branch}`,
					fromStored(stored, input.cwd),
				);
			}
		} catch {
			// Non-git/imported sessions keep branch identity as advisory; path/worktree checks remain authoritative.
		}
	}

	return {
		status: "matched",
		sessionId: input.sessionId,
		storedCwd: stored.cwd,
		currentCwd: input.cwd,
		storedWorktreeId: stored.worktreeId,
		currentWorktreeId: stored.worktreeId,
		message: "Session resume identity matched.",
	};
}

function latestStoredIdentity(database: AppServerDatabase, sessionId: string): SessionIdentitySnapshot | undefined {
	const events = readEvents(database, { streamId: sessionId, limit: 1000 });
	for (let i = events.length - 1; i >= 0; i -= 1) {
		const payload = asRecord(events[i]?.payload);
		const identity = asRecord(payload.identity);
		if (
			identity.sessionId === sessionId &&
			typeof identity.cwd === "string" &&
			typeof identity.canonicalPath === "string"
		) {
			return {
				sessionId,
				cwd: identity.cwd,
				canonicalPath: identity.canonicalPath,
				projectId: stringOrUndefined(identity.projectId),
				worktreeId: stringOrUndefined(identity.worktreeId),
				branch: typeof identity.branch === "string" || identity.branch === null ? identity.branch : undefined,
				isolationMode: stringOrUndefined(identity.isolationMode),
				sessionFile: stringOrUndefined(identity.sessionFile),
			};
		}
	}
	return undefined;
}

async function canonicalPath(path: string, options: { readonly allowMissing?: boolean } = {}): Promise<string> {
	try {
		return await realpath(resolve(path));
	} catch (error) {
		if (options.allowMissing) return resolve(path);
		throw error;
	}
}

function mismatch(
	sessionId: string,
	status: "mismatched" | "missing" | "unknown",
	messageText: string,
	fields: Partial<SessionResumeIdentity>,
): SessionResumeIdentity {
	return { status, sessionId, message: messageText, ...fields };
}

function fromStored(stored: SessionIdentitySnapshot, currentCwd: string): Partial<SessionResumeIdentity> {
	return { storedCwd: stored.cwd, currentCwd, storedWorktreeId: stored.worktreeId };
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringOrUndefined(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function appIsolationMode(target: WorkspaceTarget | undefined): string | undefined {
	if (!target) return undefined;
	return target.isolationMode === "dedicated_worktree" || target.isolationMode === "external_worktree"
		? "isolated-worktree"
		: "base-checkout";
}
function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
