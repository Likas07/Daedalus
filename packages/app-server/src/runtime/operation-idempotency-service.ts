import { createHash } from "node:crypto";
import type { AppServerDatabase } from "../persistence/database";

interface OperationRow {
	readonly operation_id: string;
	readonly method: string;
	readonly payload_hash: string;
	readonly status: "in-progress" | "completed" | "failed";
	readonly result_json: string | null;
	readonly error_message: string | null;
	readonly lease_owner: string | null;
	readonly lease_expires_at: string | null;
	readonly attempt_count: number;
}

export interface OperationIdempotencyServiceOptions {
	readonly database: AppServerDatabase;
	readonly clock?: () => Date;
	readonly leaseTtlMs?: number;
	readonly leaseOwnerFactory?: (input: { operationId: string; attemptCount: number }) => string;
}

export type OperationBeginResult =
	| { readonly status: "started"; readonly leaseOwner: string; readonly leaseExpiresAt: string; readonly attemptCount: number }
	| { readonly status: "replay"; readonly result: unknown };

export class OperationIdempotencyService {
	constructor(private readonly options: OperationIdempotencyServiceOptions) {}

	begin(input: { operationId: string; method: string; payload: unknown }): OperationBeginResult {
		const payloadHash = hashPayload(input.payload);
		return this.options.database.transaction(() => {
			const now = this.now();
			const nowIso = now.toISOString();
			const existing = this.options.database
				.query<OperationRow, [string]>(
					"SELECT operation_id, method, payload_hash, status, result_json, error_message, lease_owner, lease_expires_at, attempt_count FROM operation_idempotency_records WHERE operation_id = ?",
				)
				.get(input.operationId);
			if (existing) {
				if (existing.method !== input.method || existing.payload_hash !== payloadHash) {
					throw new Error(`Operation id conflict: ${input.operationId}`);
				}
				if (existing.status === "completed")
					return { status: "replay" as const, result: parseStoredResult(existing.result_json) };
				if (existing.status === "in-progress") {
					if (!isLeaseExpired(existing.lease_expires_at, now)) {
						throw new Error(`Operation already in progress: ${input.operationId}`);
					}
					const attemptCount = existing.attempt_count + 1;
					const leaseOwner = this.createLeaseOwner(input.operationId, attemptCount);
					const leaseExpiresAt = this.leaseExpiresAt(now);
					this.options.database
						.query(
							`UPDATE operation_idempotency_records
							 SET lease_owner = ?, lease_expires_at = ?, attempt_count = ?, updated_at = ?
							 WHERE operation_id = ? AND status = 'in-progress'`,
						)
						.run(leaseOwner, leaseExpiresAt, attemptCount, nowIso, input.operationId);
					return { status: "started" as const, leaseOwner, leaseExpiresAt, attemptCount };
				}
				throw new Error(existing.error_message ?? `Operation failed: ${input.operationId}`);
			}
			const attemptCount = 1;
			const leaseOwner = this.createLeaseOwner(input.operationId, attemptCount);
			const leaseExpiresAt = this.leaseExpiresAt(now);
			this.options.database
				.query(
					`INSERT INTO operation_idempotency_records
					 (operation_id, method, payload_hash, status, lease_owner, lease_expires_at, attempt_count, created_at, updated_at)
					 VALUES (?, ?, ?, 'in-progress', ?, ?, ?, ?, ?)`,
				)
				.run(input.operationId, input.method, payloadHash, leaseOwner, leaseExpiresAt, attemptCount, nowIso, nowIso);
			return { status: "started" as const, leaseOwner, leaseExpiresAt, attemptCount };
		})();
	}

	complete(operationId: string, leaseOwner: string, result: unknown): void {
		const resultInfo = this.options.database
			.query(
				`UPDATE operation_idempotency_records
				 SET status = 'completed', result_json = ?, error_message = NULL, updated_at = ?
				 WHERE operation_id = ? AND status = 'in-progress' AND lease_owner = ?`,
			)
			.run(JSON.stringify(result), this.now().toISOString(), operationId, leaseOwner) as { changes?: number };
		if (resultInfo.changes === 0) throw new Error(`Operation lease no longer owned by attempt: ${operationId}`);
	}

	fail(operationId: string, leaseOwner: string, error: unknown): void {
		const resultInfo = this.options.database
			.query(
				`UPDATE operation_idempotency_records
				 SET status = 'failed', error_message = ?, updated_at = ?
				 WHERE operation_id = ? AND status = 'in-progress' AND lease_owner = ?`,
			)
			.run(error instanceof Error ? error.message : String(error), this.now().toISOString(), operationId, leaseOwner) as {
			changes?: number;
		};
		if (resultInfo.changes === 0) throw new Error(`Operation lease no longer owned by attempt: ${operationId}`);
	}

	async run<T>(
		input: { operationId?: string; method: string; payload: unknown },
		operation: () => Promise<T>,
	): Promise<T> {
		if (!input.operationId) return operation();
		const begin = this.begin({ operationId: input.operationId, method: input.method, payload: input.payload });
		if (begin.status === "replay") return begin.result as T;
		try {
			const result = await operation();
			this.complete(input.operationId, begin.leaseOwner, result);
			return result;
		} catch (error) {
			this.fail(input.operationId, begin.leaseOwner, error);
			throw error;
		}
	}

	private now(): Date {
		return this.options.clock?.() ?? new Date();
	}

	private leaseExpiresAt(now: Date): string {
		return new Date(now.getTime() + (this.options.leaseTtlMs ?? 5 * 60 * 1000)).toISOString();
	}

	private createLeaseOwner(operationId: string, attemptCount: number): string {
		return this.options.leaseOwnerFactory?.({ operationId, attemptCount }) ?? `${operationId}:${attemptCount}`;
	}
}

function isLeaseExpired(leaseExpiresAt: string | null, now: Date): boolean {
	if (!leaseExpiresAt) return true;
	return Date.parse(leaseExpiresAt) <= now.getTime();
}

function parseStoredResult(value: string | null): unknown {
	if (!value) return undefined;
	return JSON.parse(value) as unknown;
}

function hashPayload(payload: unknown): string {
	return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.filter(([, entry]) => entry !== undefined)
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}
