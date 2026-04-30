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
	const timelineState = error ? "error" : isLoading ? "loading" : entries.length === 0 ? "empty" : "ready";
	const content =
		entries.length === 0
			? React.createElement(EmptyTimeline, { isLoading, error, onReconnect })
			: React.createElement(
					"div",
					{ className: "daedalus-thread-timeline-stack" },
					React.createElement(
						"ol",
						{ className: "daedalus-thread-timeline-list" },
						entries.map((entry) => React.createElement(TimelineEntry, { key: entry.id, entry })),
					),
					error || isLoading ? React.createElement(EmptyTimeline, { isLoading, error, onReconnect }) : null,
				);

	return React.createElement(
		"section",
		{
			className: "daedalus-thread-timeline",
			"aria-label": "Thread timeline",
			"data-state": timelineState,
			"data-testid": "thread-timeline",
		},
		content,
	);
}

export interface TimelineEntryProps {
	readonly entry: TimelineEntryViewModel;
}

export function TimelineEntry({ entry }: TimelineEntryProps): ReactNode {
	const role = messageRole(entry);

	return React.createElement(
		"li",
		{
			className: entryClassName(entry, role),
			"data-entry-id": entry.id,
			"data-entry-kind": entry.kind,
			"data-entry-sequence": entry.sequence,
		},
		role ? renderMessageEntry(entry, role) : renderEventEntry(entry),
	);
}

type TimelineMessageRole = "user" | "assistant";

function messageRole(entry: TimelineEntryViewModel): TimelineMessageRole | undefined {
	if (entry.kind === "user-message") return "user";
	if (entry.kind === "assistant-message") return "assistant";
	return undefined;
}

function entryClassName(entry: TimelineEntryViewModel, role: TimelineMessageRole | undefined): string {
	const category = role
		? `message daedalus-thread-entry-${role}`
		: `event daedalus-thread-entry-event-${eventCategory(entry.kind)}`;
	return `daedalus-thread-entry daedalus-thread-entry-${entry.kind} daedalus-thread-entry-${category}`;
}

function renderMessageEntry(entry: TimelineEntryViewModel, role: TimelineMessageRole): ReactNode {
	return React.createElement(
		"article",
		{
			className: `daedalus-thread-entry-row daedalus-thread-entry-row-${role}`,
			"aria-label": `${entry.title} message`,
		},
		React.createElement(
			"div",
			{ className: `daedalus-thread-message daedalus-thread-message-${role} daedalus-thread-entry-shell` },
			renderMessageHeader(entry, role),
			role === "user" ? renderUserBubble(entry) : renderAssistantCard(entry),
			renderPlaceholder(entry),
		),
	);
}

function renderMessageHeader(entry: TimelineEntryViewModel, role: TimelineMessageRole): ReactNode {
	return React.createElement(
		"header",
		{ className: `daedalus-thread-entry-header daedalus-thread-entry-header-${role}` },
		React.createElement("span", { className: "daedalus-thread-entry-author" }, entry.title),
		renderSequenceMeta(entry),
	);
}

function renderUserBubble(entry: TimelineEntryViewModel): ReactNode {
	if (!entry.body) return null;
	return React.createElement(
		"p",
		{ className: "daedalus-thread-user-bubble daedalus-thread-message-text" },
		entry.body,
	);
}

function renderAssistantCard(entry: TimelineEntryViewModel): ReactNode {
	return React.createElement(
		"div",
		{ className: "daedalus-thread-assistant-card" },
		entry.body
			? React.createElement(
					"p",
					{ className: "daedalus-thread-assistant-body daedalus-thread-message-text" },
					entry.body,
				)
			: null,
	);
}

function renderEventEntry(entry: TimelineEntryViewModel): ReactNode {
	const category = eventCategory(entry.kind);
	const label = eventLabel(entry.kind);

	return React.createElement(
		"article",
		{
			className: `daedalus-thread-entry-row daedalus-thread-entry-row-event daedalus-thread-entry-row-${category}`,
			"aria-label": `${label}: ${entry.title}`,
		},
		React.createElement(
			"div",
			{
				className: `daedalus-thread-event-card daedalus-thread-event-card-compact daedalus-thread-event-card-${category} daedalus-thread-entry-shell`,
			},
			React.createElement(
				"header",
				{ className: "daedalus-thread-event-card-header" },
				React.createElement("span", { className: "daedalus-thread-event-card-kind" }, label),
				renderSequenceMeta(entry),
			),
			React.createElement("h3", { className: "daedalus-thread-event-card-title" }, entry.title),
			renderBody(entry, "daedalus-thread-event-card-body"),
			renderPlaceholder(entry),
		),
	);
}

function renderBody(entry: TimelineEntryViewModel, className: string): ReactNode {
	if (!entry.body) return null;
	return React.createElement("p", { className }, entry.body);
}

function renderPlaceholder(entry: TimelineEntryViewModel): ReactNode {
	if (!entry.placeholder) return null;
	return React.createElement("p", { className: "daedalus-thread-entry-placeholder" }, entry.placeholder);
}

function renderSequenceMeta(entry: TimelineEntryViewModel): ReactNode {
	return React.createElement(
		"span",
		{ className: "daedalus-thread-entry-sequence", "aria-label": `Timeline sequence ${entry.sequence}` },
		`#${entry.sequence}`,
	);
}

function eventCategory(kind: TimelineEntryViewModel["kind"]): string {
	switch (kind) {
		case "approval":
			return "approval";
		case "diff":
			return "diff";
		case "terminal":
		case "terminal-output":
			return "terminal";
		case "tool":
			return "tool";
		case "plan":
			return "plan";
		case "safety":
			return "safety";
		case "system-event":
			return "system";
		case "recovery-event":
			return "recovery";
		case "user-message":
		case "assistant-message":
		case "activity":
			return "activity";
	}
}

function eventLabel(kind: TimelineEntryViewModel["kind"]): string {
	switch (kind) {
		case "user-message":
			return "User";
		case "assistant-message":
			return "Assistant";
		case "activity":
			return "Activity";
		case "tool":
			return "Tool";
		case "terminal-output":
			return "Terminal output";
		case "terminal":
			return "Terminal";
		case "approval":
			return "Approval";
		case "diff":
			return "Diff";
		case "plan":
			return "Plan";
		case "safety":
			return "Safety";
		case "system-event":
			return "System";
		case "recovery-event":
			return "Recovery";
	}
}
