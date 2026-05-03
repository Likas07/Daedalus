import type { WorkspaceSessionIdentity, WorkspaceSessionLineage, WorkspaceTarget } from "./types.js";

export interface NormalizeWorkspaceTargetOptions {
	cwd: string;
	name?: string;
}

export interface NormalizeWorkspaceSessionIdentityOptions extends NormalizeWorkspaceTargetOptions {
	sessionId?: string;
	lineage?: WorkspaceSessionLineage;
	now?: string;
}

export function normalizeWorkspaceTarget(
	input: Partial<WorkspaceTarget> | string | undefined,
	options: NormalizeWorkspaceTargetOptions,
): WorkspaceTarget {
	if (typeof input === "string") {
		return { cwd: input, isolationMode: "shared_cwd" };
	}
	return {
		cwd: input?.cwd ?? options.cwd,
		name: input?.name ?? options.name,
		isolationMode: input?.isolationMode ?? "shared_cwd",
		...input,
	};
}

export function workspaceTargetFromCwd(cwd: string, name?: string): WorkspaceTarget {
	return normalizeWorkspaceTarget(undefined, { cwd, name });
}

export function normalizeWorkspaceSessionIdentity(
	input: Partial<WorkspaceSessionIdentity> | undefined,
	options: NormalizeWorkspaceSessionIdentityOptions,
): WorkspaceSessionIdentity {
	const now = options.now ?? new Date().toISOString();
	return {
		version: 1,
		sessionId: options.sessionId ?? input?.sessionId,
		workspace: normalizeWorkspaceTarget(input?.workspace, options),
		lineage: options.lineage ? { ...input?.lineage, ...options.lineage } : input?.lineage,
		createdAt: input?.createdAt ?? now,
		updatedAt: input?.updatedAt ?? now,
	};
}

export function workspaceSessionIdentityFromCwd(cwd: string, sessionId?: string): WorkspaceSessionIdentity {
	return normalizeWorkspaceSessionIdentity(undefined, { cwd, sessionId });
}

export function withWorkspaceSessionLineage(
	identity: WorkspaceSessionIdentity | undefined,
	lineage: WorkspaceSessionLineage,
	options: NormalizeWorkspaceSessionIdentityOptions,
): WorkspaceSessionIdentity {
	const normalized = normalizeWorkspaceSessionIdentity(identity, options);
	return {
		...normalized,
		lineage: { ...normalized.lineage, ...lineage },
		updatedAt: options.now ?? new Date().toISOString(),
	};
}

export type * from "./types.js";
