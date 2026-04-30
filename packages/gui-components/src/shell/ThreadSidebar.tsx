import type { GuiShellState } from "@daedalus-pi/gui-core";
import React, { type ReactNode } from "react";
import { Badge, Button, Icon, Panel, StatusPill, type StatusPillTone } from "../ui";

export interface ThreadSidebarProps {
	readonly state: GuiShellState;
	readonly connectionLabel?: string;
	readonly activeThreadTitle?: string;
}

function formatCount(count: number, singular: string): string {
	return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
	for (const value of values) {
		const trimmed = value?.trim();
		if (trimmed) return trimmed;
	}
	return undefined;
}

function getConnectionTone(connectionLabel: string): StatusPillTone {
	const normalized = connectionLabel.toLowerCase();
	if (normalized.includes("error") || normalized.includes("failed")) return "danger";
	if (normalized.includes("disconnect") || normalized.includes("offline")) return "warning";
	if (normalized.includes("connect") || normalized.includes("online") || normalized.includes("ready"))
		return "success";
	if (normalized.includes("pending") || normalized.includes("sync") || normalized.includes("load")) return "running";
	return "idle";
}

function getActiveProjectLabel(state: GuiShellState): string {
	const activeProject = state.activeProjectId
		? state.projects.find((project) => project.id === state.activeProjectId)
		: undefined;
	return firstNonEmpty(activeProject?.name, activeProject?.path) ?? "No project selected";
}

function getActiveThreadTitle(state: GuiShellState, activeThreadTitle?: string): string {
	const activeThread = state.activeThreadId
		? state.threads.find((thread) => thread.id === state.activeThreadId)
		: undefined;
	return firstNonEmpty(activeThreadTitle, activeThread?.title) ?? "No active thread";
}

export function ThreadSidebar({ state, connectionLabel, activeThreadTitle }: ThreadSidebarProps): ReactNode {
	const projectCountLabel = formatCount(state.projects.length, "project");
	const threadCountLabel = formatCount(state.threads.length, "thread");
	const connectionStatus = connectionLabel?.trim() || "Connection pending";
	const projectLabel = getActiveProjectLabel(state);
	const threadTitle = getActiveThreadTitle(state, activeThreadTitle);

	return React.createElement(
		"aside",
		{
			"aria-label": "Daedalus thread sidebar",
			className: "daedalus-thread-sidebar",
			"data-testid": "thread-sidebar",
		},
		React.createElement(
			"div",
			{ className: "daedalus-thread-sidebar-brand" },
			React.createElement(
				"div",
				{ "aria-hidden": true, className: "daedalus-thread-sidebar-brand-mark" },
				React.createElement(Icon, { name: "spark", size: 18, tone: "success" }),
			),
			React.createElement(
				"div",
				{ className: "daedalus-thread-sidebar-brand-copy" },
				React.createElement("p", { className: "daedalus-thread-sidebar-kicker" }, "Daedalus"),
				React.createElement("h1", { className: "daedalus-thread-sidebar-title" }, "Thread workspace"),
			),
		),
		React.createElement(
			Panel,
			{ ariaLabel: "Shell status", testId: "thread-sidebar-status", tone: "inset" },
			React.createElement(
				"div",
				{ className: "daedalus-thread-sidebar-status-row" },
				React.createElement(
					StatusPill,
					{ ariaLabel: `Connection status: ${connectionStatus}`, tone: getConnectionTone(connectionStatus) },
					connectionStatus,
				),
				React.createElement("span", { className: "daedalus-thread-sidebar-protocol" }, "Protocol v1"),
			),
			React.createElement(
				"div",
				{ "aria-label": "Workspace counts", className: "daedalus-thread-sidebar-counts" },
				React.createElement(
					Badge,
					{ ariaLabel: `Projects: ${projectCountLabel}`, tone: "accent" },
					projectCountLabel,
				),
				React.createElement(
					Badge,
					{ ariaLabel: `Threads: ${threadCountLabel}`, tone: "neutral" },
					threadCountLabel,
				),
				React.createElement(
					"span",
					{ className: "daedalus-thread-sidebar-count-summary" },
					`${projectCountLabel} · ${threadCountLabel}`,
				),
			),
		),
		React.createElement(
			"nav",
			{ "aria-label": "Thread navigation", className: "daedalus-thread-sidebar-nav" },
			React.createElement("p", { className: "daedalus-thread-sidebar-section-label" }, "Active thread"),
			React.createElement(
				"div",
				{ className: "daedalus-thread-sidebar-active-thread", "data-testid": "thread-sidebar-active-thread" },
				React.createElement(Icon, { name: "thread", size: 16, tone: "default" }),
				React.createElement(
					"div",
					{ className: "daedalus-thread-sidebar-active-copy" },
					React.createElement("span", { className: "daedalus-thread-sidebar-active-title" }, threadTitle),
					React.createElement("span", { className: "daedalus-thread-sidebar-active-project" }, projectLabel),
				),
			),
		),
		React.createElement(
			"div",
			{ className: "daedalus-thread-sidebar-affordance" },
			React.createElement(
				Button,
				{
					ariaLabel: "New thread placeholder",
					disabled: true,
					size: "sm",
					testId: "thread-sidebar-new-thread",
					tone: "ghost",
				},
				React.createElement(Icon, { name: "spark", size: 14, tone: "muted" }),
				"New thread soon",
			),
		),
	);
}
