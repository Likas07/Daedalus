import * as fs from "node:fs/promises";
import { dirname } from "node:path";
import type { WorkspaceCleanupRisk, WorkspaceTarget } from "./types.js";

export type MergeBackOperationStatus = "clean" | "conflict" | "failed" | "applied" | "discarded" | "kept";

export interface MergeBackResult {
	status: MergeBackOperationStatus;
	message: string;
	stdout?: string;
	stderr?: string;
	patch?: string;
	files?: string[];
	conflicts?: string[];
	risk?: WorkspaceCleanupRisk;
}

export interface MergeBackInput {
	parent: WorkspaceTarget;
	child: WorkspaceTarget;
	baseRef?: string;
	artifactPath?: string;
	force?: boolean;
}

function runGit(
	cwd: string,
	args: string[],
	input?: string,
): { ok: boolean; stdout: string; stderr: string; exitCode: number } {
	const result = Bun.spawnSync(["git", ...args], {
		cwd,
		stdin: input === undefined ? undefined : new TextEncoder().encode(input),
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		ok: result.exitCode === 0,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
		exitCode: result.exitCode,
	};
}

function base(input: MergeBackInput): string {
	return (
		input.baseRef ??
		input.child.baseCommit ??
		input.child.mergeBack?.baseCommit ??
		input.child.baseBranch ??
		input.parent.branch ??
		"HEAD"
	);
}

function filesFromNameStatus(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.trim().split(/\s+/).slice(1).join(" "))
		.filter(Boolean);
}

function conflicts(cwd: string): string[] {
	const result = runGit(cwd, ["diff", "--name-only", "--diff-filter=U"]);
	return result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

export function inspectMergeBack(input: MergeBackInput): MergeBackResult {
	const ref = base(input);
	const stat = runGit(input.child.cwd, ["diff", "--stat", ref, "HEAD"]);
	if (!stat.ok)
		return { status: "failed", message: stat.stderr.trim() || "diff inspection failed", stderr: stat.stderr };
	const names = runGit(input.child.cwd, ["diff", "--name-status", ref, "HEAD"]);
	return {
		status: stat.stdout.trim() ? "clean" : "clean",
		message: stat.stdout.trim() || "No changes to merge back.",
		stdout: stat.stdout,
		files: filesFromNameStatus(names.stdout),
	};
}

export async function captureMergeBackPatch(input: MergeBackInput): Promise<MergeBackResult> {
	const result = runGit(input.child.cwd, ["diff", "--binary", base(input), "HEAD"]);
	if (!result.ok)
		return { status: "failed", message: result.stderr.trim() || "patch capture failed", stderr: result.stderr };
	if (input.artifactPath) {
		await fs.mkdir(dirname(input.artifactPath), { recursive: true });
		await fs.writeFile(input.artifactPath, result.stdout, "utf8");
	}
	return {
		status: "clean",
		message: input.artifactPath ? `Patch written to ${input.artifactPath}` : "Patch captured.",
		patch: result.stdout,
	};
}

async function patchFor(input: MergeBackInput): Promise<string> {
	if (input.artifactPath) return fs.readFile(input.artifactPath, "utf8");
	return (await captureMergeBackPatch(input)).patch ?? "";
}

export async function dryRunApplyMergeBack(input: MergeBackInput): Promise<MergeBackResult> {
	const patch = await patchFor(input);
	const result = runGit(input.parent.cwd, ["apply", "--check"], patch);
	if (result.ok) return { status: "clean", message: "Patch applies cleanly.", stdout: result.stdout };
	return {
		status: "conflict",
		message: result.stderr.trim() || "Patch does not apply cleanly.",
		stderr: result.stderr,
	};
}

export async function applyMergeBackPatch(input: MergeBackInput): Promise<MergeBackResult> {
	const patch = await patchFor(input);
	const result = runGit(input.parent.cwd, ["apply"], patch);
	if (result.ok) return { status: "applied", message: "Patch applied.", stdout: result.stdout };
	return { status: "conflict", message: result.stderr.trim() || "Patch apply failed.", stderr: result.stderr };
}

export function cherryPickMergeBack(input: MergeBackInput): MergeBackResult {
	const result = runGit(input.parent.cwd, ["cherry-pick", `${base(input)}..${input.child.branch ?? "HEAD"}`]);
	if (result.ok) return { status: "applied", message: "Cherry-pick applied.", stdout: result.stdout };
	return {
		status: "conflict",
		message: result.stderr.trim() || "Cherry-pick conflicted.",
		stderr: result.stderr,
		conflicts: conflicts(input.parent.cwd),
	};
}

export function mergeBranchMergeBack(input: MergeBackInput): MergeBackResult {
	if (!input.child.branch) return { status: "failed", message: "Child target has no branch to merge." };
	const result = runGit(input.parent.cwd, ["merge", "--no-ff", input.child.branch]);
	if (result.ok) return { status: "applied", message: "Branch merged.", stdout: result.stdout };
	return {
		status: "conflict",
		message: result.stderr.trim() || "Merge conflicted.",
		stderr: result.stderr,
		conflicts: conflicts(input.parent.cwd),
	};
}

export function assessCleanupRisk(target: WorkspaceTarget): WorkspaceCleanupRisk {
	if (target.isolationMode !== "dedicated_worktree")
		return { safe: false, level: "external", reasons: ["Target is not a dedicated child worktree."] };
	const status = runGit(target.cwd, ["status", "--porcelain"]);
	if (!status.ok) return { safe: false, level: "missing", reasons: ["Target is missing or not a git worktree."] };
	if (status.stdout.trim())
		return { safe: false, level: "dirty", reasons: ["Target has uncommitted changes."], dirtyStatus: status.stdout };
	return { safe: true, level: "safe", reasons: [] };
}

export function discardChildTarget(input: MergeBackInput): MergeBackResult {
	const risk = assessCleanupRisk(input.child);
	if (!risk.safe && !input.force)
		return { status: "failed", message: "Refusing to discard risky child target.", risk };
	const result = runGit(input.parent.cwd, [
		"worktree",
		"remove",
		...(input.force ? ["--force"] : []),
		input.child.cwd,
	]);
	return result.ok
		? { status: "discarded", message: "Child target discarded.", risk }
		: { status: "failed", message: result.stderr.trim() || "Discard failed.", stderr: result.stderr, risk };
}

export function keepChildTarget(_input: MergeBackInput): MergeBackResult {
	return { status: "kept", message: "Child target kept for manual follow-up." };
}

export function cleanupTarget(input: MergeBackInput): MergeBackResult {
	return discardChildTarget(input);
}
