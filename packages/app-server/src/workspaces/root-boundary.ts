import { lstat, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type { RootBoundaryViolation, RootScopedTarget } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "..";
import { listProjectSessions } from "../persistence/read-model";
import { ProjectService } from "./project-service";
import { WorktreeService } from "./worktree-service";

export type RootBoundaryPurpose = "project" | "worktree" | "session" | "terminal" | "operation" | string;

export type RootBoundaryTarget =
	| { readonly kind: "project"; readonly projectId: string; readonly targetPath?: string }
	| {
			readonly kind: "worktree";
			readonly worktreeId: string;
			readonly projectId?: string;
			readonly targetPath?: string;
	  }
	| { readonly kind: "session"; readonly sessionId: string; readonly projectId: string; readonly targetPath?: string }
	| RootScopedTarget;

export interface ResolveRootScopedTargetInput {
	readonly database: AppServerDatabase;
	readonly target: RootBoundaryTarget;
}

export interface AssertPathWithinRootInput {
	readonly root: string;
	readonly candidate: string;
	readonly purpose: RootBoundaryPurpose;
	readonly projectId?: string;
}

export class RootBoundaryError extends Error {
	readonly violation: RootBoundaryViolation;

	constructor(violation: RootBoundaryViolation) {
		super(violation.message);
		this.name = "RootBoundaryError";
		this.violation = violation;
	}
}

export async function resolveRootScopedTarget(input: ResolveRootScopedTargetInput): Promise<RootScopedTarget> {
	const target = input.target;
	if (isRootScopedTarget(target)) {
		const resolved = await assertPathWithinRoot({
			root: target.rootPath,
			candidate: target.targetPath,
			purpose: "operation",
			projectId: target.projectId,
		});
		if (resolved.canonicalRootPath !== target.canonicalRootPath) {
			throwBoundaryViolation({
				reason: "target-outside-root",
				message: `Root canonical path mismatch: expected ${target.canonicalRootPath}, found ${resolved.canonicalRootPath}`,
				target: resolved,
				resolvedPath: resolved.canonicalRootPath,
			});
		}
		if (resolved.canonicalTargetPath !== target.canonicalTargetPath) {
			throwBoundaryViolation({
				reason: "target-outside-root",
				message: `Target canonical path mismatch: expected ${target.canonicalTargetPath}, found ${resolved.canonicalTargetPath}`,
				target: resolved,
				resolvedPath: resolved.canonicalTargetPath,
			});
		}
		return resolved;
	}

	if (target.kind === "project") {
		const project = new ProjectService({ database: input.database }).get(target.projectId);
		if (!project) throwUnknownTarget(`Unknown project: ${target.projectId}`);
		return assertPathWithinRoot({
			root: project.path,
			candidate: target.targetPath ?? project.path,
			purpose: "project",
			projectId: project.id,
		});
	}

	if (target.kind === "worktree") {
		const worktree = new WorktreeService({ database: input.database }).open(target.worktreeId);
		if (!worktree) throwUnknownTarget(`Unknown worktree: ${target.worktreeId}`);
		if (target.projectId && worktree.projectId !== target.projectId) {
			throwUnknownTarget(`Worktree ${target.worktreeId} does not belong to project ${target.projectId}`);
		}
		return assertPathWithinRoot({
			root: worktree.path,
			candidate: target.targetPath ?? worktree.path,
			purpose: "worktree",
			projectId: worktree.projectId,
		});
	}

	const session = listProjectSessions(input.database, target.projectId).find((row) => row.id === target.sessionId);
	if (!session) throwUnknownTarget(`Unknown session: ${target.sessionId}`);
	if (!session.runsIn) throwUnknownTarget(`Session has no runtime target: ${target.sessionId}`);
	return assertPathWithinRoot({
		root: session.runsIn.path,
		candidate: target.targetPath ?? session.runsIn.path,
		purpose: "session",
		projectId: session.runsIn.projectId,
	});
}

export async function assertPathWithinRoot(input: AssertPathWithinRootInput): Promise<RootScopedTarget> {
	const rootPath = resolve(input.root);
	let canonicalRootPath: string;
	try {
		canonicalRootPath = await realpath(rootPath);
	} catch (error) {
		const target = unresolvedTarget(input.projectId, rootPath, input.candidate);
		throwBoundaryViolation({
			reason: errorReason(error, "root-missing"),
			message: `${input.purpose} root is missing or inaccessible: ${rootPath}`,
			target,
			resolvedPath: rootPath,
		});
	}

	const targetPath = resolve(input.candidate);
	const target = await resolveCandidate({
		projectId: input.projectId,
		rootPath,
		canonicalRootPath,
		targetPath,
		purpose: input.purpose,
	});

	if (!isPathInside(canonicalRootPath, target.canonicalTargetPath)) {
		const symlinkEscape = target.isSymlink;
		throwBoundaryViolation({
			reason: symlinkEscape ? "symlink-escape" : "target-outside-root",
			message: symlinkEscape
				? `${input.purpose} target symlink escapes root: ${targetPath}`
				: `${input.purpose} target is outside root: ${targetPath}`,
			target: target.scoped,
			resolvedPath: target.canonicalTargetPath,
		});
	}

	return target.scoped;
}

interface ResolveCandidateInput {
	readonly projectId?: string;
	readonly rootPath: string;
	readonly canonicalRootPath: string;
	readonly targetPath: string;
	readonly purpose: RootBoundaryPurpose;
}

async function resolveCandidate(input: ResolveCandidateInput): Promise<{
	readonly scoped: RootScopedTarget;
	readonly existing: boolean;
	readonly isSymlink: boolean;
	readonly canonicalTargetPath: string;
}> {
	try {
		const stat = await lstat(input.targetPath);
		const canonicalTargetPath = await realpath(input.targetPath);
		return {
			existing: true,
			isSymlink: stat.isSymbolicLink(),
			canonicalTargetPath,
			scoped: scopedTarget(
				input.projectId,
				input.rootPath,
				input.canonicalRootPath,
				input.targetPath,
				canonicalTargetPath,
			),
		};
	} catch (error) {
		if (!isMissingPathError(error)) {
			const target = scopedTarget(
				input.projectId,
				input.rootPath,
				input.canonicalRootPath,
				input.targetPath,
				input.targetPath,
			);
			throwBoundaryViolation({
				reason: errorReason(error, "unknown"),
				message: `${input.purpose} target is inaccessible: ${input.targetPath}`,
				target,
				resolvedPath: input.targetPath,
			});
		}
	}

	const parent = await nearestExistingParent(input.targetPath);
	if (!parent) {
		const target = scopedTarget(
			input.projectId,
			input.rootPath,
			input.canonicalRootPath,
			input.targetPath,
			input.targetPath,
		);
		throwBoundaryViolation({
			reason: "target-missing",
			message: `${input.purpose} target has no existing parent: ${input.targetPath}`,
			target,
			resolvedPath: input.targetPath,
		});
	}
	const canonicalParent = await realpath(parent.path);
	const suffix = relative(parent.path, input.targetPath);
	const canonicalTargetPath = suffix ? resolve(canonicalParent, suffix) : canonicalParent;
	return {
		existing: false,
		isSymlink: parent.isSymlink,
		canonicalTargetPath,
		scoped: scopedTarget(
			input.projectId,
			input.rootPath,
			input.canonicalRootPath,
			input.targetPath,
			canonicalTargetPath,
		),
	};
}

async function nearestExistingParent(
	path: string,
): Promise<{ readonly path: string; readonly isSymlink: boolean } | null> {
	let current = path;
	while (true) {
		current = dirname(current);
		try {
			const stat = await lstat(current);
			return { path: current, isSymlink: stat.isSymbolicLink() };
		} catch (error) {
			if (!isMissingPathError(error)) throw error;
		}
		const next = dirname(current);
		if (next === current) return null;
	}
}

function scopedTarget(
	projectId: string | undefined,
	rootPath: string,
	canonicalRootPath: string,
	targetPath: string,
	canonicalTargetPath: string,
): RootScopedTarget {
	return {
		...(projectId ? { projectId } : {}),
		rootPath,
		canonicalRootPath,
		targetPath,
		canonicalTargetPath,
	};
}

function unresolvedTarget(projectId: string | undefined, rootPath: string, targetPath: string): RootScopedTarget {
	return scopedTarget(projectId, rootPath, rootPath, resolve(targetPath), resolve(targetPath));
}

function isPathInside(root: string, candidate: string): boolean {
	const rel = relative(root, candidate);
	return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`) && !resolve(rel).startsWith(".."));
}

function isRootScopedTarget(target: RootBoundaryTarget): target is RootScopedTarget {
	return (
		"rootPath" in target && "canonicalRootPath" in target && "targetPath" in target && "canonicalTargetPath" in target
	);
}

function throwUnknownTarget(message: string): never {
	throw new Error(message);
}

function throwBoundaryViolation(violation: RootBoundaryViolation): never {
	throw new RootBoundaryError(violation);
}

function isMissingPathError(error: unknown): boolean {
	return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function errorReason(error: unknown, fallback: RootBoundaryViolation["reason"]): RootBoundaryViolation["reason"] {
	if (error instanceof Error && "code" in error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "EACCES" || code === "EPERM") return "permission-denied";
	}
	return fallback;
}
