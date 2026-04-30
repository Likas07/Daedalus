import { type ApprovalV1RequestClient, decideApproval, listApprovals } from "@daedalus-pi/app-server-client";
import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import { ApprovalQueue } from "@daedalus-pi/gui-components";
import {
	type ApprovalQueueState,
	approvalQueueReducer,
	createInitialApprovalQueueState,
} from "@daedalus-pi/gui-core/approval/reducer";
import React, { type ReactNode } from "react";

interface ReactHookRuntime {
	useEffect(effect: () => undefined | (() => void), dependencies: readonly unknown[]): void;
	useState<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
}

const ReactHooks = React as unknown as ReactHookRuntime;

export type ApprovalPanelClient = ApprovalV1RequestClient & {
	readonly onNotification?: (method: string, listener: (params: unknown, message: unknown) => void) => () => void;
};

export interface ApprovalPanelProps {
	readonly client: ApprovalPanelClient;
	readonly threadId: string;
	readonly workspaceTargetId?: string;
	readonly turnId?: string;
}

export function ApprovalPanel({ client, threadId, workspaceTargetId, turnId }: ApprovalPanelProps): ReactNode {
	const [state, setState] = ReactHooks.useState<ApprovalQueueState>(() =>
		createInitialApprovalQueueState({ threadId, workspaceTargetId }),
	);
	const dispatch = (action: Parameters<typeof approvalQueueReducer>[1]) =>
		setState((current) => approvalQueueReducer(current, action));

	ReactHooks.useEffect(() => {
		if (!workspaceTargetId) return undefined;
		let cancelled = false;
		const load = async () => {
			dispatch({ type: "approval.loading", threadId, workspaceTargetId });
			try {
				const result = await listApprovals(client, { threadId, turnId, workspaceTargetId });
				if (!cancelled) dispatch({ type: "approval.loaded", result });
			} catch (error) {
				if (!cancelled)
					dispatch({ type: "approval.error", error: error instanceof Error ? error.message : String(error) });
			}
		};
		void load();
		const unsubscribe = client.onNotification?.("v1.approval.changed", (params) => {
			const notification = params as protocolV1.ApprovalRequestNotification;
			if (notification.threadId !== threadId || notification.workspaceTargetId !== workspaceTargetId) return;
			void load();
		});
		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [client, threadId, turnId, workspaceTargetId]);

	const decide = async (approvalId: string, decision: protocolV1.ApprovalDecisionValue) => {
		if (!workspaceTargetId) return;
		const request = state.requestsById[approvalId];
		const effectiveTurnId = request?.turnId ?? turnId;
		if (!effectiveTurnId) return;
		dispatch({ type: "approval.decisionStarted", approvalId, decision });
		try {
			const result = await decideApproval(client, {
				approvalId,
				threadId,
				turnId: effectiveTurnId,
				workspaceTargetId,
				decision,
			});
			if (result.ok) dispatch({ type: "approval.decisionCompleted", result });
			else dispatch({ type: "approval.failed", failure: result });
		} catch (error) {
			dispatch({ type: "approval.error", error: error instanceof Error ? error.message : String(error) });
		}
	};

	return React.createElement(ApprovalQueue, {
		state,
		onApprove: (approvalId: string) => decide(approvalId, "approved"),
		onDeny: (approvalId: string) => decide(approvalId, "denied"),
	});
}
