import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const WORKTREE_METADATA_VERSION = 1;
export const WORKTREE_METADATA_RELATIVE_PATH = join(".daedalus", "worktree.json");

export type WorktreeSetupStatus = "created" | "setup_pending" | "setup_complete" | "setup_failed";

export interface WorktreeMetadata {
	version: typeof WORKTREE_METADATA_VERSION;
	branch: string;
	baseRef: string;
	baseCommit: string;
	mergeTarget?: string;
	setup: {
		status: WorktreeSetupStatus;
		updatedAt: string;
	};
	createdAt: string;
}

export interface CreateWorktreeMetadataOptions {
	branch: string;
	baseRef: string;
	baseCommit: string;
	mergeTarget?: string;
	setupStatus?: WorktreeSetupStatus;
	now?: Date;
}

export function worktreeMetadataPath(worktreePath: string): string {
	return join(worktreePath, WORKTREE_METADATA_RELATIVE_PATH);
}

export function createWorktreeMetadata(options: CreateWorktreeMetadataOptions): WorktreeMetadata {
	const timestamp = (options.now ?? new Date()).toISOString();
	return {
		version: WORKTREE_METADATA_VERSION,
		branch: options.branch,
		baseRef: options.baseRef,
		baseCommit: options.baseCommit,
		mergeTarget: options.mergeTarget,
		setup: {
			status: options.setupStatus ?? "created",
			updatedAt: timestamp,
		},
		createdAt: timestamp,
	};
}

function assertString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Invalid worktree metadata: ${field} must be a string`);
	}
	return value;
}

function assertSetupStatus(value: unknown): WorktreeSetupStatus {
	if (value === "created" || value === "setup_pending" || value === "setup_complete" || value === "setup_failed") {
		return value;
	}
	throw new Error("Invalid worktree metadata: setup.status is invalid");
}

export function parseWorktreeMetadata(value: unknown): WorktreeMetadata {
	if (!value || typeof value !== "object") throw new Error("Invalid worktree metadata: expected object");
	const record = value as Record<string, unknown>;
	if (record.version !== WORKTREE_METADATA_VERSION) throw new Error("Invalid worktree metadata: unsupported version");
	const setup = record.setup;
	if (!setup || typeof setup !== "object") throw new Error("Invalid worktree metadata: setup must be an object");
	const setupRecord = setup as Record<string, unknown>;
	const metadata: WorktreeMetadata = {
		version: WORKTREE_METADATA_VERSION,
		branch: assertString(record.branch, "branch"),
		baseRef: assertString(record.baseRef, "baseRef"),
		baseCommit: assertString(record.baseCommit, "baseCommit"),
		setup: {
			status: assertSetupStatus(setupRecord.status),
			updatedAt: assertString(setupRecord.updatedAt, "setup.updatedAt"),
		},
		createdAt: assertString(record.createdAt, "createdAt"),
	};
	if (record.mergeTarget !== undefined) metadata.mergeTarget = assertString(record.mergeTarget, "mergeTarget");
	return metadata;
}

export function writeWorktreeMetadata(worktreePath: string, metadata: WorktreeMetadata): string {
	const path = worktreeMetadataPath(worktreePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(metadata, null, "\t")}\n`);
	return path;
}

export function readWorktreeMetadata(worktreePath: string): WorktreeMetadata | undefined {
	const path = worktreeMetadataPath(worktreePath);
	if (!existsSync(path)) return undefined;
	return parseWorktreeMetadata(JSON.parse(readFileSync(path, "utf8")));
}
