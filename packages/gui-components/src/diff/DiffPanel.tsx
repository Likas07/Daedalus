import type { DiffPanelState } from "@daedalus-pi/gui-core/diff/reducer";
import { selectDiffFiles, selectSelectedDiffFile, selectSelectedDiffWindow } from "@daedalus-pi/gui-core/diff/reducer";
import React, { type ReactNode } from "react";
import { DiffFileView } from "./DiffFileView";

export interface DiffPanelProps {
	readonly state: DiffPanelState;
	readonly onRefresh?: () => void | Promise<void>;
	readonly onSelectFile?: (filePath: string) => void | Promise<void>;
	readonly onLoadWindow?: (filePath: string) => void | Promise<void>;
}

export function DiffPanel({ state, onRefresh, onSelectFile, onLoadWindow }: DiffPanelProps): ReactNode {
	const files = selectDiffFiles(state);
	const selected = selectSelectedDiffFile(state);
	const selectedWindow = selectSelectedDiffWindow(state);
	return React.createElement(
		"section",
		{ className: "daedalus-diff-panel", "aria-label": "Diff panel", "data-testid": "diff-panel" },
		React.createElement(
			"header",
			null,
			React.createElement("h2", null, "Diff"),
			React.createElement("button", { type: "button", onClick: () => void onRefresh?.() }, "Refresh"),
		),
		state.isSummaryLoading ? React.createElement("p", null, "Loading diff summary…") : null,
		state.failure
			? React.createElement(
					"p",
					{ role: "alert", className: "daedalus-diff-failure", "data-testid": "diff-failure" },
					`${state.failure.code}: ${state.failure.message}`,
				)
			: null,
		state.summary && files.length === 0 ? React.createElement("p", null, "No workspace changes") : null,
		state.summary?.isLarge
			? React.createElement("p", { "data-testid": "diff-large-summary" }, "Large diff summary")
			: null,
		React.createElement(
			"div",
			{ className: "daedalus-diff-layout" },
			React.createElement(
				"ul",
				{ className: "daedalus-diff-file-list", "aria-label": "Changed files" },
				files.map((file) =>
					React.createElement(
						"li",
						{ key: file.path },
						React.createElement(
							"button",
							{
								type: "button",
								"aria-pressed": file.path === state.selectedFilePath,
								onClick: () => void onSelectFile?.(file.path),
							},
							`${file.status} ${file.path}`,
						),
					),
				),
			),
			React.createElement(DiffFileView, {
				file: selected,
				window: selectedWindow,
				isLoading: state.loadingFilePath === selected?.path,
				onLoadWindow,
			}),
		),
	);
}
