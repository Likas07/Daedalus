import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import React, { type ReactNode } from "react";

export interface DiffFileViewProps {
	readonly file?: protocolV1.DiffFileSummary;
	readonly window?: protocolV1.DiffFileWindow;
	readonly isLoading?: boolean;
	readonly onLoadWindow?: (filePath: string) => void | Promise<void>;
}

export function DiffFileView({ file, window, isLoading, onLoadWindow }: DiffFileViewProps): ReactNode {
	if (!file) return React.createElement("p", { className: "daedalus-diff-empty" }, "Select a changed file");
	const chunks = window?.chunks ?? [];
	return React.createElement(
		"article",
		{ className: "daedalus-diff-file-view", "data-testid": "diff-file-view", "data-file-path": file.path },
		React.createElement(
			"header",
			null,
			React.createElement("strong", null, file.path),
			React.createElement("span", null, `${file.insertions}+ / ${file.deletions}-`),
		),
		file.isBinary ? React.createElement("p", null, "Binary file; textual diff is unavailable.") : null,
		file.isLarge
			? React.createElement(
					"p",
					{ className: "daedalus-diff-large", "data-testid": "diff-large-file" },
					"Large diff is windowed. Load a slice to inspect safely.",
				)
			: null,
		!window && !isLoading
			? React.createElement(
					"button",
					{ type: "button", onClick: () => void onLoadWindow?.(file.path) },
					"Load diff window",
				)
			: null,
		isLoading ? React.createElement("p", null, "Loading diff window…") : null,
		chunks.length > 0
			? React.createElement(
					"pre",
					{ className: "daedalus-diff-patch", "data-testid": "diff-patch" },
					chunks.map((chunk) => chunk.text).join("\n"),
				)
			: null,
		window?.hasMoreAfter || window?.hasMoreBefore
			? React.createElement("p", { className: "daedalus-diff-window-state" }, "More diff hunks are available.")
			: null,
	);
}
