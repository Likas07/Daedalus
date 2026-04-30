import type { ThreadViewModel } from "@daedalus-pi/gui-core";
import React, { type ReactNode } from "react";
import { Composer } from "./Composer";
import { ApprovalPlaceholder, DiffPlaceholder, TerminalPlaceholder } from "./EmptyStates";
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
	const statusLabel = viewModel.isReplaying
		? "Replaying"
		: viewModel.isLive
			? "Live"
			: (thread?.status ?? "Disconnected");

	return React.createElement(
		"main",
		{ className: "daedalus-thread-workspace", "data-testid": "thread-workspace" },
		React.createElement(
			"section",
			{ className: "daedalus-thread-main" },
			React.createElement(
				"header",
				{ className: "daedalus-thread-header" },
				React.createElement("p", null, "Thread"),
				React.createElement("h1", null, thread?.title ?? "Daedalus thread"),
				React.createElement("p", { "data-testid": "thread-status" }, statusLabel),
			),
			React.createElement(Timeline, {
				entries: viewModel.timeline,
				isLoading: isLoading || viewModel.isReplaying,
				error: viewModel.error,
				onReconnect: onReconnect ? () => void onReconnect() : undefined,
			}),
			React.createElement(Composer, {
				disabled: isLoading || isSubmitting || viewModel.isReplaying,
				isRunning,
				inputRef: composerRef,
				onSubmit: onSubmitTurn,
				onCancel: onCancelTurn,
			}),
		),
		React.createElement(
			"aside",
			{ className: "daedalus-thread-sidecar", "aria-label": "Thread side panels" },
			React.createElement(ApprovalPlaceholder),
			React.createElement(DiffPlaceholder),
			React.createElement(TerminalPlaceholder),
		),
	);
}
