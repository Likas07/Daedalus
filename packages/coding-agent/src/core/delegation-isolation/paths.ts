import { join, resolve } from "node:path";
import type { DelegationIsolationPaths } from "./types";

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function encodeRepoRoot(repoRoot: string): string {
	return Buffer.from(resolve(repoRoot), "utf8").toString("base64url");
}

export function assertSafeRunId(runId: string): void {
	if (!RUN_ID_PATTERN.test(runId) || runId.includes("..") || runId.includes("/") || runId.includes("\\")) {
		throw new Error(`Invalid delegation isolation runId: ${runId}`);
	}
}

export function getDelegationIsolationPaths(repoRoot: string, runId: string): DelegationIsolationPaths {
	assertSafeRunId(runId);
	const resolvedRepoRoot = resolve(repoRoot);
	const encodedRepoRoot = encodeRepoRoot(resolvedRepoRoot);
	const baseDir = join(resolvedRepoRoot, ".daedalus", "isolation", encodedRepoRoot, runId);
	const mergedDir = join(baseDir, "merged");
	return { repoRoot: resolvedRepoRoot, runId, encodedRepoRoot, baseDir, mergedDir };
}
