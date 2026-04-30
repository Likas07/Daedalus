import type { TerminalV1NotificationClient, ThreadV1NotificationClient } from "@daedalus-pi/app-server-client";
import { ThreadWorkspace } from "@daedalus-pi/gui-components";
import React, { type ReactNode } from "react";
import { ApprovalPanel } from "./ApprovalPanel";
import { DiffPanel } from "./DiffPanel";
import { TerminalPanel } from "./TerminalPanel";
import { useThreadLoop } from "./useThreadLoop";

type RefObject<T> = { current: T };
const ReactHooks = React as unknown as { useRef<T>(initial: T): RefObject<T> };

export interface ThreadRouteProps {
	readonly client: ThreadV1NotificationClient;
	readonly threadId: string;
}

export function ThreadRoute({ client, threadId }: ThreadRouteProps): ReactNode {
	const loop = useThreadLoop({ client, threadId });
	const composerRef = ReactHooks.useRef<HTMLTextAreaElement | null>(null);

	const thread = loop.viewModel.thread;
	const workspaceTargetId = thread?.workspaceTargetId;
	const turnId = thread?.lastTurnId ?? loop.activeTurnId;

	return React.createElement(
		"section",
		{ className: "daedalus-thread-route", "data-testid": "thread-route" },
		React.createElement(ThreadWorkspace, {
			viewModel: loop.viewModel,
			isLoading: loop.isLoading,
			isSubmitting: loop.isSubmitting,
			composerRef,
			onSubmitTurn: loop.submitTurn,
			onCancelTurn: loop.cancelActiveTurn,
			onReconnect: loop.reconnect,
		}),
		React.createElement(
			"aside",
			{ className: "daedalus-phase3-panels", "aria-label": "Approval diff terminal panels" },
			React.createElement(ApprovalPanel, { client, threadId, workspaceTargetId, turnId }),
			React.createElement(DiffPanel, { client, threadId, workspaceTargetId, turnId }),
			React.createElement(TerminalPanel, {
				client: client as TerminalV1NotificationClient,
				threadId,
				workspaceTargetId,
				turnId,
			}),
		),
	);
}
