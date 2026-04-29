import { createHash } from "node:crypto";
import type { AppServerDatabase } from "../persistence/database";

interface OperationRow {
	readonly operation_id: string;
	readonly method: string;
	readonly payload_hash: string;
	readonly status: "in-progress" | "completed" | "failed";
	readonly result_json: string | null;
	readonly error_message: string | null;
}

export interface OperationIdempotencyServiceOptions {
	readonly database: AppServerDatabase;
}

export type OperationBeginResult =
	| { readonly status: "started" }
	| { readonly status: "replay"; readonly result: unknown };

export class OperationIdempotencyService {
	constructor(private readonly options: OperationIdempotencyServiceOptions) {}

	begin(input: { operationId: string; method: string; payload: unknown }): OperationBeginResult {
		const payloadHash = hashPayload(input.payload);
		return this.options.database.transaction(() => {
			const existing = this.options.database
				.query<OperationRow, [string]>(
					"SELECT operation_id, method, payload_hash, status, result_json, error_message FROM operation_idempotency_records WHERE operation_id = ?",
				)
				.get(input.operationId);
			if (existing) {
				if (existing.method !== input.method || existing.payload_hash !== payloadHash) {
					throw new Error(`Operation id conflict: ${input.operationId}`);
				}
				if (existing.status === "completed")
					return { status: "replay" as const, result: parseStoredResult(existing.result_json) };
				if (existing.status === "in-progress")
					throw new Error(`Operation already in progress: ${input.operationId}`);
				throw new Error(existing.error_message ?? `Operation failed: ${input.operationId}`);
			}
			const now = new Date().toISOString();
			this.options.database
				.query(
					`INSERT INTO operation_idempotency_records
					 (operation_id, method, payload_hash, status, created_at, updated_at)
					 VALUES (?, ?, ?, 'in-progress', ?, ?)`,
				)
				.run(input.operationId, input.method, payloadHash, now, now);
			return { status: "started" as const };
		})();
	}

	complete(operationId: string, result: unknown): void {
		this.options.database
			.query(
				`UPDATE operation_idempotency_records
				 SET status = 'completed', result_json = ?, error_message = NULL, updated_at = ?
				 WHERE operation_id = ? AND status = 'in-progress'`,
			)
			.run(JSON.stringify(result), new Date().toISOString(), operationId);
	}

	fail(operationId: string, error: unknown): void {
		this.options.database
			.query(
				`UPDATE operation_idempotency_records
				 SET status = 'failed', error_message = ?, updated_at = ?
				 WHERE operation_id = ? AND status = 'in-progress'`,
			)
			.run(error instanceof Error ? error.message : String(error), new Date().toISOString(), operationId);
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
			this.complete(input.operationId, result);
			return result;
		} catch (error) {
			this.fail(input.operationId, error);
			throw error;
		}
	}
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
