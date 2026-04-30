import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import React, { type CSSProperties, type ReactNode } from "react";

export interface DiffFileViewProps {
	readonly file?: protocolV1.DiffFileSummary;
	readonly window?: protocolV1.DiffFileWindow;
	readonly isLoading?: boolean;
	readonly onLoadWindow?: (filePath: string) => void | Promise<void>;
}

const patchSurfaceStyle: CSSProperties = {
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
	overflowX: "auto",
	whiteSpace: "pre-wrap",
};

const fileHeaderStyle: CSSProperties = {
	position: "sticky",
	top: 0,
	zIndex: 1,
};

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

function renderFileStat(label: string, value: ReactNode): ReactNode {
	return React.createElement(
		"div",
		{ className: "daedalus-diff-file-stat" },
		React.createElement("dt", null, label),
		React.createElement("dd", null, value),
	);
}

function renderWindowCallout(window: protocolV1.DiffFileWindow | undefined): ReactNode {
	if (!window) return null;
	if (window.hasMoreAfter || window.hasMoreBefore) {
		return React.createElement(
			"p",
			{ className: "daedalus-diff-window-state", role: "note" },
			"More diff hunks are available.",
		);
	}

	return React.createElement(
		"p",
		{ className: "daedalus-diff-window-state", role: "note" },
		"Showing the loaded diff window.",
	);
}

export function DiffFileView({ file, window, isLoading, onLoadWindow }: DiffFileViewProps): ReactNode {
	if (!file) return React.createElement("p", { className: "daedalus-diff-empty" }, "Select a changed file");
	const chunks = window?.chunks ?? [];

	return React.createElement(
		"article",
		{
			className: "daedalus-diff-file-view",
			"data-testid": "diff-file-view",
			"data-file-path": file.path,
		},
		React.createElement(
			"header",
			{ className: "daedalus-diff-file-header", style: fileHeaderStyle },
			React.createElement(
				"div",
				{ className: "daedalus-diff-file-title" },
				React.createElement("p", null, "Selected file"),
				React.createElement("strong", null, file.path),
			),
			React.createElement(
				"dl",
				{ className: "daedalus-diff-file-stats", "aria-label": "Selected file stats" },
				renderFileStat("Status", file.status),
				renderFileStat("Lines", `${file.insertions}+ / ${file.deletions}-`),
				renderFileStat("Hunks", pluralize(file.hunks, "hunk")),
				renderFileStat("Size", formatBytes(file.byteLength)),
			),
		),
		file.isBinary ? React.createElement("p", null, "Binary file; textual diff is unavailable.") : null,
		file.isLarge
			? React.createElement(
					"aside",
					{ className: "daedalus-diff-large", "data-testid": "diff-large-file", role: "note" },
					React.createElement("p", null, "Large diff is windowed. Load a slice to inspect safely."),
				)
			: null,
		!window && !isLoading
			? React.createElement(
					"button",
					{
						type: "button",
						className: "daedalus-diff-window-button",
						onClick: () => void onLoadWindow?.(file.path),
					},
					"Load diff window",
				)
			: null,
		isLoading ? React.createElement("p", null, "Loading diff window…") : null,
		renderWindowCallout(window),
		chunks.length > 0
			? React.createElement(
					"pre",
					{ className: "daedalus-diff-patch", "data-testid": "diff-patch", style: patchSurfaceStyle },
					chunks.map((chunk) => chunk.text).join("\n"),
				)
			: window && !isLoading && !file.isBinary
				? React.createElement("p", { className: "daedalus-diff-empty-window" }, "No textual hunks in this window.")
				: null,
	);
}
