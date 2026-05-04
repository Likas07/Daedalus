import type { AppServerClient } from "@daedalus-pi/app-server-client";
import type {
	OrchestrationGetFullThreadDiffInput,
	OrchestrationGetFullThreadDiffResult,
	OrchestrationGetTurnDiffInput,
	OrchestrationGetTurnDiffResult,
} from "@t3tools/contracts";

function getPatch(diff: { patch?: string }): string {
	return diff.patch ?? "";
}

export async function getT3FullThreadDiff(
	client: AppServerClient,
	input: OrchestrationGetFullThreadDiffInput,
): Promise<OrchestrationGetFullThreadDiffResult> {
	const { diff } = await client.request("diff/get", {
		target: { kind: "session", sessionId: input.threadId },
	} as never);

	return {
		threadId: input.threadId,
		fromTurnCount: 0,
		toTurnCount: input.toTurnCount,
		diff: getPatch(diff),
	};
}

export async function getT3TurnDiff(
	client: AppServerClient,
	input: OrchestrationGetTurnDiffInput,
): Promise<OrchestrationGetTurnDiffResult & { status: "degraded"; reason: string }> {
	const fullThreadDiff = await getT3FullThreadDiff(client, {
		threadId: input.threadId,
		toTurnCount: input.toTurnCount,
	});

	return {
		...fullThreadDiff,
		fromTurnCount: input.fromTurnCount,
		status: "degraded",
		reason: "Daedalus turn-scoped checkpoint diff mapping is not available yet; showing the full thread diff.",
	};
}
