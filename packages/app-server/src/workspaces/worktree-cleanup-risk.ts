import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { OperationId, WorkflowChangedFile, WorktreeId } from "@daedalus-pi/app-server-protocol";
import { type GitStatusSummary, gitStatus } from "./git";

export type WorktreeCleanupRiskReasonKind = "dirty-files" | "unpushed-commits" | "active-sessions" | "active-terminals";

export interface WorktreeCleanupRiskReason {
	readonly kind: WorktreeCleanupRiskReasonKind;
	readonly severity: "warning" | "danger";
	readonly message: string;
	readonly count: number;
	readonly files?: WorkflowChangedFile[];
	readonly sessionIds?: string[];
	readonly terminalIds?: string[];
}

export interface WorktreeCleanupRiskScan {
	readonly worktreeId: WorktreeId;
	readonly operationId: OperationId;
	readonly risky: boolean;
	readonly riskHash: string;
	readonly reasons: WorktreeCleanupRiskReason[];
	readonly dirtyFiles: WorkflowChangedFile[];
	readonly unpushedCommitCount: number;
	readonly activeSessionIds: string[];
	readonly activeTerminalIds: string[];
	readonly confirmationToken?: string;
	readonly confirmationTokenExpiresAt?: string;
	readonly scannedAt: string;
}

export interface WorktreeCleanupScanInput {
	readonly worktreeId: WorktreeId;
	readonly worktreePath: string;
	readonly operationId?: OperationId;
	readonly activeSessionIds?: readonly string[];
	readonly activeTerminalIds?: readonly string[];
	readonly now?: Date;
	readonly status?: GitStatusSummary;
}

export interface WorktreeCleanupTokenValidationInput {
	readonly token: string;
	readonly worktreeId: WorktreeId;
	readonly operationId: OperationId;
	readonly riskHash: string;
	readonly now?: Date;
}

const TOKEN_TTL_MS = 5 * 60 * 1000;
const tokenSecret = randomBytes(32);

export async function scanWorktreeCleanupRisk(input: WorktreeCleanupScanInput): Promise<WorktreeCleanupRiskScan> {
	const status = input.status ?? (await gitStatus(input.worktreePath));
	return buildWorktreeCleanupRiskScan({ ...input, status });
}

export function buildWorktreeCleanupRiskScan(
	input: WorktreeCleanupScanInput & { readonly status: GitStatusSummary },
): WorktreeCleanupRiskScan {
	const operationId = input.operationId ?? `worktree-cleanup-${crypto.randomUUID()}`;
	const scannedAt = (input.now ?? new Date()).toISOString();
	const dirtyFiles = [...input.status.files];
	const unpushedCommitCount = input.status.ahead;
	const activeSessionIds = [...(input.activeSessionIds ?? [])].sort();
	const activeTerminalIds = [...(input.activeTerminalIds ?? [])].sort();
	const reasons: WorktreeCleanupRiskReason[] = [];
	if (dirtyFiles.length > 0) {
		reasons.push({
			kind: "dirty-files",
			severity: "danger",
			message: `${dirtyFiles.length} dirty file(s) would be deleted with this worktree.`,
			count: dirtyFiles.length,
			files: dirtyFiles,
		});
	}
	if (unpushedCommitCount > 0) {
		reasons.push({
			kind: "unpushed-commits",
			severity: "danger",
			message: `${unpushedCommitCount} unpushed commit(s) may only exist in this worktree.`,
			count: unpushedCommitCount,
		});
	}
	if (activeSessionIds.length > 0) {
		reasons.push({
			kind: "active-sessions",
			severity: "warning",
			message: `${activeSessionIds.length} active session(s) are attached to this worktree.`,
			count: activeSessionIds.length,
			sessionIds: activeSessionIds,
		});
	}
	if (activeTerminalIds.length > 0) {
		reasons.push({
			kind: "active-terminals",
			severity: "warning",
			message: `${activeTerminalIds.length} running terminal(s) are attached to this worktree.`,
			count: activeTerminalIds.length,
			terminalIds: activeTerminalIds,
		});
	}
	const riskHash = cleanupRiskHash({ dirtyFiles, unpushedCommitCount, activeSessionIds, activeTerminalIds });
	const risky = reasons.length > 0;
	const token = risky
		? createCleanupConfirmationToken({ worktreeId: input.worktreeId, operationId, riskHash, now: input.now })
		: undefined;
	return {
		worktreeId: input.worktreeId,
		operationId,
		risky,
		riskHash,
		reasons,
		dirtyFiles,
		unpushedCommitCount,
		activeSessionIds,
		activeTerminalIds,
		...(token ? { confirmationToken: token.token, confirmationTokenExpiresAt: token.expiresAt } : {}),
		scannedAt,
	};
}

export function cleanupRiskHash(input: {
	readonly dirtyFiles: readonly WorkflowChangedFile[];
	readonly unpushedCommitCount: number;
	readonly activeSessionIds: readonly string[];
	readonly activeTerminalIds: readonly string[];
}): string {
	const payload = JSON.stringify({
		dirtyFiles: input.dirtyFiles
			.map((file) => ({ path: file.path, status: file.status, staged: file.staged }))
			.sort((a, b) => a.path.localeCompare(b.path)),
		unpushedCommitCount: input.unpushedCommitCount,
		activeSessionIds: [...input.activeSessionIds].sort(),
		activeTerminalIds: [...input.activeTerminalIds].sort(),
	});
	return createHmac("sha256", tokenSecret).update(payload).digest("base64url");
}

function createCleanupConfirmationToken(input: {
	readonly worktreeId: WorktreeId;
	readonly operationId: OperationId;
	readonly riskHash: string;
	readonly now?: Date;
}): { readonly token: string; readonly expiresAt: string } {
	const issuedAt = input.now?.getTime() ?? Date.now();
	const expiresAtMs = issuedAt + TOKEN_TTL_MS;
	const payload = {
		worktreeId: input.worktreeId,
		operationId: input.operationId,
		riskHash: input.riskHash,
		issuedAt,
		expiresAt: expiresAtMs,
	};
	const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = createHmac("sha256", tokenSecret).update(encoded).digest("base64url");
	return { token: `${encoded}.${signature}`, expiresAt: new Date(expiresAtMs).toISOString() };
}

export function validateCleanupConfirmationToken(input: WorktreeCleanupTokenValidationInput): boolean {
	const [encoded, signature] = input.token.split(".");
	if (!encoded || !signature) return false;
	const expected = createHmac("sha256", tokenSecret).update(encoded).digest("base64url");
	if (!safeEqual(signature, expected)) return false;
	let payload: { worktreeId?: string; operationId?: string; riskHash?: string; expiresAt?: number };
	try {
		payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
	} catch {
		return false;
	}
	const now = input.now?.getTime() ?? Date.now();
	return (
		payload.worktreeId === input.worktreeId &&
		payload.operationId === input.operationId &&
		payload.riskHash === input.riskHash &&
		typeof payload.expiresAt === "number" &&
		payload.expiresAt >= now
	);
}

function safeEqual(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
