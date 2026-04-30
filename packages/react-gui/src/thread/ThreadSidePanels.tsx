import type { TerminalV1NotificationClient, ThreadV1NotificationClient } from "@daedalus-pi/app-server-client";
import React, { type ReactNode } from "react";
import { ApprovalPanel } from "./ApprovalPanel";
import { DiffPanel } from "./DiffPanel";
import { TerminalPanel } from "./TerminalPanel";

export interface ThreadSidePanelsProps {
	readonly client: ThreadV1NotificationClient;
	readonly threadId: string;
	readonly workspaceTargetId?: string;
	readonly turnId?: string;
}

export function ThreadSidePanels({ client, threadId, workspaceTargetId, turnId }: ThreadSidePanelsProps): ReactNode {
	return React.createElement(
		"aside",
		{
			"aria-label": "Approval diff terminal panels",
			className: "daedalus-side-panels",
			"data-testid": "thread-side-panels",
		},
		React.createElement(ApprovalPanel, { client, threadId, workspaceTargetId, turnId }),
		React.createElement(DiffPanel, { client, threadId, workspaceTargetId, turnId }),
		React.createElement(TerminalPanel, {
			client: client as TerminalV1NotificationClient,
			threadId,
			workspaceTargetId,
			turnId,
		}),
	);
}
