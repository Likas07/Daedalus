import type { ShellThreadSummary, ThreadDetailSnapshot } from "@daedalus-pi/app-server-protocol";

export interface ThreadProjectionCoreInput {
	readonly status: string;
	readonly title?: string | null;
	readonly needsAttentionReason?: string | null;
	readonly validationStatus?: string | null;
	readonly isolationMode?: string | null;
	readonly pendingActionCount?: number;
	readonly fallbackTitle?: string;
}

export type ThreadProjectionStatus = ShellThreadSummary["status"] & ThreadDetailSnapshot["status"];

export function deriveThreadProjectionCore(input: ThreadProjectionCoreInput): {
	readonly title: string;
	readonly status: ThreadProjectionStatus;
	readonly safetySignals: ShellThreadSummary["safetySignals"];
	readonly pendingActionCount: number;
} {
	const pendingActionCount = input.pendingActionCount ?? 0;
	const safetySignals: ShellThreadSummary["safetySignals"] = [];
	if (input.needsAttentionReason)
		safetySignals.push({ level: "warning", message: input.needsAttentionReason, code: "needs-attention" });
	if (input.validationStatus && input.validationStatus !== "valid")
		safetySignals.push({
			level: "warning",
			message: `Target state is ${input.validationStatus}`,
			code: "target-validation",
		});
	if (input.isolationMode === "base-checkout")
		safetySignals.push({ level: "warning", message: "Runs in Base checkout", code: "base-checkout" });
	if (pendingActionCount > 0)
		safetySignals.push({
			level: "info",
			message: `${pendingActionCount} pending approval${pendingActionCount === 1 ? "" : "s"}`,
			code: "pending-approval",
		});
	return {
		title: input.title ?? input.fallbackTitle ?? "Untitled Thread",
		status: mapThreadProjectionStatus(input.status, pendingActionCount),
		safetySignals,
		pendingActionCount,
	};
}

export function mapThreadProjectionStatus(status: string, pendingActionCount: number): ThreadProjectionStatus {
	if (pendingActionCount > 0 || status === "waiting_for_approval") return "waiting";
	if (["active", "running"].includes(status)) return "running";
	if (["failed", "needs-attention"].includes(status)) return "failed";
	if (["completed", "done"].includes(status)) return "completed";
	return "idle";
}
