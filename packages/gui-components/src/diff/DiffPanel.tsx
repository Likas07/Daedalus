import type { DiffPanelState } from "@daedalus-pi/gui-core/diff/reducer";
import { selectDiffFiles, selectSelectedDiffFile, selectSelectedDiffWindow } from "@daedalus-pi/gui-core/diff/reducer";
import React, { type CSSProperties, type ReactNode } from "react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { StatusPill, type StatusPillTone } from "../ui/StatusPill";
import { DiffFileView } from "./DiffFileView";

export interface DiffPanelProps {
	readonly state: DiffPanelState;
	readonly onRefresh?: () => void | Promise<void>;
	readonly onSelectFile?: (filePath: string) => void | Promise<void>;
	readonly onLoadWindow?: (filePath: string) => void | Promise<void>;
}

type DiffSummary = NonNullable<DiffPanelState["summary"]>;
type DiffFileSummary = DiffSummary["files"][number];
type DiffStatus = DiffSummary["status"];

const stickyHeaderStyle: CSSProperties = {
	position: "sticky",
	top: 0,
	zIndex: 1,
};

function statusTone(status?: DiffStatus): StatusPillTone {
	switch (status) {
		case "clean":
			return "success";
		case "changed":
		case "large":
			return "warning";
		case "target-mismatch":
		case "error":
			return "danger";
		default:
			return "idle";
	}
}

function statusLabel(status?: DiffStatus): string {
	return status ? status.replaceAll("-", " ") : "not loaded";
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

function formatBytes(bytes: number): string {
	if (bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
	return `${rounded} ${units[unitIndex]}`;
}

function fileStatsLabel(file: DiffFileSummary): string {
	return `${file.insertions}+ / ${file.deletions}-`;
}

function renderStat(label: string, value: ReactNode): ReactNode {
	return React.createElement(
		"div",
		{ className: "daedalus-diff-stat" },
		React.createElement("dt", null, label),
		React.createElement("dd", null, value),
	);
}

function renderStatsRow(summary: DiffSummary | undefined, files: readonly DiffFileSummary[]): ReactNode {
	const filesChanged = summary?.filesChanged ?? files.length;
	const insertions = summary?.insertions ?? files.reduce((total, file) => total + file.insertions, 0);
	const deletions = summary?.deletions ?? files.reduce((total, file) => total + file.deletions, 0);
	const hunks = files.reduce((total, file) => total + file.hunks, 0);
	const totalBytes = summary?.totalBytes ?? files.reduce((total, file) => total + file.byteLength, 0);

	return React.createElement(
		"dl",
		{
			"aria-label": "Diff stats",
			className: "daedalus-diff-stats-row",
			"data-testid": "diff-stats-row",
		},
		renderStat("Files", pluralize(filesChanged, "file changed", "files changed")),
		renderStat("Insertions", `+${insertions}`),
		renderStat("Deletions", `-${deletions}`),
		renderStat("Hunks", pluralize(hunks, "hunk")),
		renderStat("Size", formatBytes(totalBytes)),
	);
}

function renderLargeSummary(summary: DiffSummary | undefined): ReactNode {
	if (!summary?.isLarge) return null;
	const omitted = pluralize(summary.omittedFileCount, "omitted file");

	return React.createElement(
		"aside",
		{
			className: "daedalus-diff-large-summary",
			"data-testid": "diff-large-summary",
			role: "note",
		},
		React.createElement("strong", null, "Large diff summary"),
		React.createElement(
			"p",
			null,
			`This diff is windowed so the review stays responsive. ${omitted} may require loading additional windows.`,
		),
	);
}

export function DiffPanel({ state, onRefresh, onSelectFile, onLoadWindow }: DiffPanelProps): ReactNode {
	const files = selectDiffFiles(state);
	const selected = selectSelectedDiffFile(state);
	const selectedWindow = selectSelectedDiffWindow(state);
	const summary = state.summary;
	const title = summary?.title ?? "Workspace diff";
	const isEmpty = Boolean(summary) && files.length === 0;

	return React.createElement(
		"section",
		{ className: "daedalus-diff-panel", "aria-label": "Diff panel", "data-testid": "diff-panel" },
		React.createElement(
			"header",
			{ className: "daedalus-diff-header", style: stickyHeaderStyle },
			React.createElement(
				"div",
				{ className: "daedalus-diff-header-copy" },
				React.createElement("p", { className: "daedalus-diff-eyebrow" }, "Review changes"),
				React.createElement("h2", null, title),
				React.createElement(
					"p",
					{ className: "daedalus-diff-subtitle" },
					summary
						? `${pluralize(summary.filesChanged, "file changed", "files changed")} · ${summary.insertions}+ / ${summary.deletions}-`
						: "Load the latest workspace diff",
				),
			),
			React.createElement(
				"div",
				{ className: "daedalus-diff-header-actions" },
				React.createElement(
					StatusPill,
					{ ariaLabel: `Diff status: ${statusLabel(summary?.status)}`, tone: statusTone(summary?.status) },
					statusLabel(summary?.status),
				),
				React.createElement(
					Button,
					{ ariaLabel: "Refresh diff", size: "sm", tone: "secondary", onClick: () => void onRefresh?.() },
					"Refresh",
				),
			),
		),
		state.isSummaryLoading ? React.createElement("p", null, "Loading diff summary…") : null,
		state.failure
			? React.createElement(
					"p",
					{ role: "alert", className: "daedalus-diff-failure", "data-testid": "diff-failure" },
					`${state.failure.code}: ${state.failure.message}`,
				)
			: null,
		renderLargeSummary(summary),
		renderStatsRow(summary, files),
		isEmpty ? React.createElement("p", { className: "daedalus-diff-empty-summary" }, "No workspace changes") : null,
		React.createElement(
			"div",
			{ className: "daedalus-diff-layout" },
			React.createElement(
				"aside",
				{ className: "daedalus-diff-file-shell", "aria-label": "Changed file list" },
				React.createElement(
					"div",
					{ className: "daedalus-diff-file-shell-header" },
					React.createElement("h3", null, "Changed files"),
					React.createElement(Badge, { ariaLabel: `${files.length} changed files` }, String(files.length)),
				),
				React.createElement(
					"ul",
					{ className: "daedalus-diff-file-list", "aria-label": "Changed files" },
					files.length === 0
						? React.createElement("li", { className: "daedalus-diff-file-empty" }, "No changed files")
						: files.map((file) => {
								const isSelected = file.path === state.selectedFilePath;
								return React.createElement(
									"li",
									{ key: file.path },
									React.createElement(
										"button",
										{
											type: "button",
											"aria-current": isSelected ? "true" : undefined,
											"aria-pressed": isSelected,
											className: isSelected
												? "daedalus-diff-file-button is-selected"
												: "daedalus-diff-file-button",
											onClick: () => void onSelectFile?.(file.path),
										},
										React.createElement(
											"span",
											{ className: "daedalus-diff-file-main" },
											React.createElement("span", { className: "daedalus-diff-file-status" }, file.status),
											React.createElement("span", { className: "daedalus-diff-file-path" }, file.path),
										),
										React.createElement(
											"span",
											{ className: "daedalus-diff-file-stats" },
											fileStatsLabel(file),
										),
									),
								);
							}),
				),
			),
			React.createElement(
				"section",
				{ className: "daedalus-diff-selected-pane", "aria-label": "Selected file diff" },
				React.createElement(DiffFileView, {
					file: selected,
					window: selectedWindow,
					isLoading: state.loadingFilePath === selected?.path,
					onLoadWindow,
				}),
			),
		),
	);
}
