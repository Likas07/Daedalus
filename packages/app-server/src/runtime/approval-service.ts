import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import { type AppServerDatabase, appendEvent, type EventPayload } from "..";
import { projectRuntimeEvents } from "../persistence/projector";
import { listActiveApprovals } from "../persistence/read-model";
import type { AccessPolicyService } from "./access-policy-service";

export interface ApprovalRequestInput {
	readonly id?: string;
	readonly sessionId?: string;
	readonly request: unknown;
	readonly hardBlock?: boolean;
}

export interface ApprovalDecision {
	readonly approvalId: string;
	readonly decision: "approved" | "denied";
	readonly reason?: string;
	readonly message?: string;
}

export class ApprovalService {
	private readonly waiters = new Map<
		string,
		{ resolve: (decision: ApprovalDecision) => void; reject: (error: Error) => void; timer?: Timer }
	>();

	constructor(
		private readonly database: AppServerDatabase,
		private readonly accessPolicy: AccessPolicyService,
		private readonly publish?: (event: AppEvent) => void,
	) {}

	list(sessionId?: string): unknown[] {
		return listActiveApprovals(this.database, sessionId);
	}

	request(input: ApprovalRequestInput): { approvalId: string; autoApproved: boolean } {
		const approvalId = input.id ?? `approval-${crypto.randomUUID()}`;
		const request =
			input.request && typeof input.request === "object"
				? (input.request as Record<string, unknown>)
				: { value: input.request };
		const payload = {
			approvalId,
			sessionId: input.sessionId,
			...request,
			request,
			hardBlock: input.hardBlock === true,
		};
		appendEvent(this.database, {
			streamId: input.sessionId ?? "app",
			type: "approval/requested",
			payload: payload as EventPayload,
		});
		projectRuntimeEvents(this.database);
		this.publish?.({
			id: approvalId,
			type: "approval/requested",
			ts: new Date().toISOString(),
			sessionId: input.sessionId,
			payload,
		} as unknown as AppEvent);
		if (this.accessPolicy.getPolicy().mode === "unrestricted" && input.hardBlock !== true) {
			this.resolve({ approvalId, decision: "approved", reason: "auto-approved by Unrestricted mode" });
			this.accessPolicy.auditAutoApproved(approvalId);
			return { approvalId, autoApproved: true };
		}
		return { approvalId, autoApproved: false };
	}

	waitForDecision(
		approvalId: string,
		options: { timeoutMs?: number; signal?: AbortSignal } = {},
	): Promise<ApprovalDecision> {
		if (options.signal?.aborted) return Promise.reject(new Error("Approval wait was cancelled."));
		return new Promise((resolve, reject) => {
			const waiter = { resolve, reject, timer: undefined as Timer | undefined };
			const cleanup = () => {
				if (waiter.timer) clearTimeout(waiter.timer);
				options.signal?.removeEventListener("abort", onAbort);
				this.waiters.delete(approvalId);
			};
			const onAbort = () => {
				cleanup();
				reject(new Error("Approval wait was cancelled."));
			};
			waiter.resolve = (decision) => {
				cleanup();
				resolve(decision);
			};
			waiter.reject = (error) => {
				cleanup();
				reject(error);
			};
			if (options.timeoutMs && options.timeoutMs > 0)
				waiter.timer = setTimeout(() => waiter.reject(new Error("Approval timed out.")), options.timeoutMs);
			options.signal?.addEventListener("abort", onAbort, { once: true });
			this.waiters.set(approvalId, waiter);
		});
	}

	resolve(input: ApprovalDecision): void {
		const event = {
			type: "approval/resolved",
			approvalId: input.approvalId,
			decision: input.decision,
			reason: input.reason ?? input.message,
			ts: new Date().toISOString(),
		} as unknown as AppEvent;
		appendEvent(this.database, {
			streamId: "app",
			type: "approval/resolved",
			payload: event as unknown as EventPayload,
		});
		projectRuntimeEvents(this.database);
		this.waiters.get(input.approvalId)?.resolve(input);
		this.publish?.(event);
	}

	cancel(approvalId: string, reason = "Approval was cancelled."): void {
		this.resolve({ approvalId, decision: "denied", reason });
	}
}
