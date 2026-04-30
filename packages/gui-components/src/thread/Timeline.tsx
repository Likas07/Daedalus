import type { TimelineEntryViewModel } from "@daedalus-pi/gui-core";
import React, { type ReactNode } from "react";
import { EmptyTimeline } from "./EmptyStates";

export interface TimelineProps {
	readonly entries: readonly TimelineEntryViewModel[];
	readonly isLoading?: boolean;
	readonly error?: string;
	readonly onReconnect?: () => void;
}

export function Timeline({ entries, isLoading, error, onReconnect }: TimelineProps): ReactNode {
	if (entries.length === 0) return React.createElement(EmptyTimeline, { isLoading, error, onReconnect });

	return React.createElement(
		"ol",
		{ className: "daedalus-thread-timeline", "aria-label": "Thread timeline", "data-testid": "thread-timeline" },
		entries.map((entry) => React.createElement(TimelineEntry, { key: entry.id, entry })),
	);
}

export interface TimelineEntryProps {
	readonly entry: TimelineEntryViewModel;
}

export function TimelineEntry({ entry }: TimelineEntryProps): ReactNode {
	return React.createElement(
		"li",
		{
			className: `daedalus-thread-entry daedalus-thread-entry-${entry.kind}`,
			"data-entry-id": entry.id,
			"data-entry-kind": entry.kind,
		},
		React.createElement(
			"article",
			null,
			React.createElement(
				"header",
				{ className: "daedalus-thread-entry-header" },
				React.createElement("strong", null, entry.title),
				React.createElement("span", null, `#${entry.sequence}`),
			),
			entry.body ? React.createElement("p", { className: "daedalus-thread-entry-body" }, entry.body) : null,
			entry.placeholder
				? React.createElement("p", { className: "daedalus-thread-entry-placeholder" }, entry.placeholder)
				: null,
		),
	);
}
