import type { ThreadViewModel } from "@daedalus-pi/gui-core";
import React, { type ReactNode } from "react";
import { Composer } from "./Composer";
import { ThreadHeader } from "./ThreadHeader";
import { Timeline } from "./Timeline";

type RefObject<T> = { readonly current: T };

export interface ThreadWorkspaceProps {
	readonly viewModel: ThreadViewModel;
	readonly isLoading?: boolean;
	readonly isSubmitting?: boolean;
	readonly composerRef?: RefObject<HTMLTextAreaElement | null>;
	readonly onSubmitTurn: (prompt: string) => void | Promise<void>;
	readonly onCancelTurn?: () => void | Promise<void>;
	readonly onReconnect?: () => void | Promise<void>;
}

export function ThreadWorkspace({
	viewModel,
	isLoading,
	isSubmitting,
	composerRef,
	onSubmitTurn,
	onCancelTurn,
	onReconnect,
}: ThreadWorkspaceProps): ReactNode {
	const thread = viewModel.thread;
	const isRunning = thread?.status === "running" || viewModel.turns.some((turn) => turn.status === "running");

	return React.createElement(
		"main",
		{ className: "daedalus-thread-workspace", "data-testid": "thread-workspace" },
		React.createElement(ThreadHeader, { viewModel }),
		React.createElement(
			"section",
			{
				"aria-label": "Thread timeline viewport",
				className: "daedalus-thread-timeline-viewport",
				"data-testid": "thread-timeline-viewport",
			},
			React.createElement(Timeline, {
				entries: viewModel.timeline,
				error: viewModel.error,
				isLoading: isLoading || viewModel.isReplaying,
				onReconnect: onReconnect ? () => void onReconnect() : undefined,
			}),
		),
		React.createElement(
			"section",
			{
				"aria-label": "Thread composer dock",
				className: "daedalus-thread-composer-dock",
				"data-testid": "thread-composer-dock",
			},
			React.createElement(Composer, {
				disabled: isLoading || isSubmitting || viewModel.isReplaying,
				inputRef: composerRef,
				isRunning,
				onCancel: onCancelTurn,
				onSubmit: onSubmitTurn,
			}),
		),
	);
}
