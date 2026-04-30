import { describe, expect, test } from "bun:test";
import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { DiffPanelState } from "@daedalus-pi/gui-core/diff/reducer";
import React from "react";
import { expectMarkupContains, renderMarkup } from "../test/render";
import { DiffPanel } from "./DiffPanel";

const scope = {
	diffId: "diff-1",
	workspaceTargetId: "workspace-1",
	threadId: "thread-1",
	turnId: "turn-1",
	checkpointId: "checkpoint-1",
} as const;

type ElementNode = {
	readonly type: unknown;
	readonly props?: Record<string, unknown> | null;
};

function isElementNode(value: unknown): value is ElementNode {
	return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function resolveNode(node: unknown): unknown {
	if (isElementNode(node) && typeof node.type === "function") {
		return (node.type as (props: Record<string, unknown>) => unknown)(node.props ?? {});
	}
	return node;
}

function visitElements(node: unknown, visitor: (element: ElementNode) => void): void {
	const resolved = resolveNode(node);
	if (Array.isArray(resolved)) {
		for (const child of resolved) visitElements(child, visitor);
		return;
	}
	if (!isElementNode(resolved)) return;
	visitor(resolved);
	visitElements(resolved.props?.children, visitor);
}

function textContent(node: unknown): string {
	const resolved = resolveNode(node);
	if (resolved === undefined || resolved === null || typeof resolved === "boolean") return "";
	if (Array.isArray(resolved)) return resolved.map(textContent).join("");
	if (typeof resolved === "string" || typeof resolved === "number" || typeof resolved === "bigint") {
		return String(resolved);
	}
	if (!isElementNode(resolved)) return "";
	return textContent(resolved.props?.children);
}

function findButtonByText(tree: unknown, text: string): ElementNode {
	let found: ElementNode | undefined;
	visitElements(tree, (element) => {
		if (!found && element.type === "button" && textContent(element).includes(text)) found = element;
	});
	if (!found) throw new Error(`Expected button containing ${text}`);
	return found;
}

function click(button: ElementNode): void {
	const onClick = button.props?.onClick;
	if (typeof onClick !== "function") throw new Error(`Expected ${textContent(button)} to have an onClick handler`);
	onClick();
}

function diffFile(overrides: Partial<protocolV1.DiffFileSummary> = {}): protocolV1.DiffFileSummary {
	return {
		path: "src/App.tsx",
		status: "modified",
		insertions: 10,
		deletions: 2,
		hunks: 1,
		byteLength: 1024,
		isBinary: false,
		isLarge: false,
		...overrides,
	};
}

function diffSummary(overrides: Partial<protocolV1.DiffSummary> = {}): protocolV1.DiffSummary {
	const files = overrides.files ?? [diffFile()];
	const insertions = overrides.insertions ?? files.reduce((sum, file) => sum + file.insertions, 0);
	const deletions = overrides.deletions ?? files.reduce((sum, file) => sum + file.deletions, 0);
	const totalBytes = overrides.totalBytes ?? files.reduce((sum, file) => sum + file.byteLength, 0);

	return {
		diffId: overrides.diffId ?? scope.diffId,
		workspaceTargetId: overrides.workspaceTargetId ?? scope.workspaceTargetId,
		threadId: overrides.threadId ?? scope.threadId,
		turnId: overrides.turnId ?? scope.turnId,
		checkpointId: overrides.checkpointId ?? scope.checkpointId,
		status: overrides.status ?? (files.length > 0 ? "changed" : "clean"),
		title: overrides.title ?? "Workspace changes",
		createdAt: overrides.createdAt ?? "2026-04-30T12:00:00Z",
		updatedAt: overrides.updatedAt,
		baseRef: overrides.baseRef,
		headRef: overrides.headRef,
		filesChanged: overrides.filesChanged ?? files.length,
		insertions,
		deletions,
		totalBytes,
		isLarge: overrides.isLarge ?? false,
		files,
		omittedFileCount: overrides.omittedFileCount ?? 0,
	};
}

function diffChunk(overrides: Partial<protocolV1.DiffHunkWindowChunk> = {}): protocolV1.DiffHunkWindowChunk {
	return {
		cursor: { seq: 1 },
		oldStart: 1,
		oldLines: 2,
		newStart: 1,
		newLines: 2,
		text: "@@ -1,2 +1,2 @@\n-const value = 1;\n+const value = 2;",
		byteLength: 52,
		...overrides,
	};
}

function diffWindow(overrides: Partial<protocolV1.DiffFileWindow> = {}): protocolV1.DiffFileWindow {
	const chunks = overrides.chunks ?? [diffChunk()];
	return {
		diffId: overrides.diffId ?? scope.diffId,
		workspaceTargetId: overrides.workspaceTargetId ?? scope.workspaceTargetId,
		threadId: overrides.threadId ?? scope.threadId,
		turnId: overrides.turnId ?? scope.turnId,
		checkpointId: overrides.checkpointId ?? scope.checkpointId,
		filePath: overrides.filePath ?? "src/App.tsx",
		status: overrides.status ?? "modified",
		isBinary: overrides.isBinary ?? false,
		isLarge: overrides.isLarge ?? false,
		byteLength: overrides.byteLength ?? chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
		chunks,
		nextCursor: overrides.nextCursor,
		previousCursor: overrides.previousCursor,
		hasMoreAfter: overrides.hasMoreAfter ?? false,
		hasMoreBefore: overrides.hasMoreBefore ?? false,
	};
}

function panelState(overrides: Partial<DiffPanelState> = {}): DiffPanelState {
	const summary = overrides.summary ?? diffSummary();
	return {
		threadId: overrides.threadId ?? summary.threadId,
		workspaceTargetId: overrides.workspaceTargetId ?? summary.workspaceTargetId,
		summary,
		selectedFilePath: overrides.selectedFilePath ?? summary.files[0]?.path,
		fileWindowsByPath: overrides.fileWindowsByPath ?? {},
		isSummaryLoading: overrides.isSummaryLoading ?? false,
		loadingFilePath: overrides.loadingFilePath,
		failure: overrides.failure,
		error: overrides.error,
	};
}

describe("DiffPanel", () => {
	test("renders no-changes state without losing the diff shell", () => {
		const summary = diffSummary({ files: [], filesChanged: 0, insertions: 0, deletions: 0, totalBytes: 0 });
		const markup = renderMarkup(React.createElement(DiffPanel, { state: panelState({ summary }) }));

		expectMarkupContains(markup, [
			'data-testid="diff-panel"',
			"Review changes",
			"No workspace changes",
			"Changed files",
			"No changed files",
			"0 files changed",
			"clean",
		]);
	});

	test("renders the changed-file list and selected file affordance", () => {
		const files = [
			diffFile(),
			diffFile({ path: "package.json", status: "added", insertions: 2, deletions: 1, hunks: 2, byteLength: 512 }),
		];
		const summary = diffSummary({ files, filesChanged: 2 });
		const markup = renderMarkup(React.createElement(DiffPanel, { state: panelState({ summary }) }));

		expectMarkupContains(markup, [
			'aria-label="Changed files"',
			'aria-current="true"',
			'aria-pressed="true"',
			"modified",
			"src/App.tsx",
			"added",
			"package.json",
			"10+ / 2-",
		]);
	});

	test("renders the selected-file patch in a monospaced patch surface", () => {
		const window = diffWindow();
		const markup = renderMarkup(
			React.createElement(DiffPanel, {
				state: panelState({ fileWindowsByPath: { "src/App.tsx": window } }),
			}),
		);

		expectMarkupContains(markup, [
			'data-testid="diff-file-view"',
			'data-file-path="src/App.tsx"',
			'data-testid="diff-patch"',
			"@@ -1,2 +1,2 @@",
			"-const value = 1;",
			"+const value = 2;",
		]);
	});

	test("renders a stats row from summary totals", () => {
		const files = [
			diffFile(),
			diffFile({ path: "src/index.ts", status: "modified", insertions: 2, deletions: 1, hunks: 2, byteLength: 512 }),
		];
		const summary = diffSummary({ files, filesChanged: 2, insertions: 12, deletions: 3, totalBytes: 1536 });
		const markup = renderMarkup(React.createElement(DiffPanel, { state: panelState({ summary }) }));

		expectMarkupContains(markup, [
			'data-testid="diff-stats-row"',
			'aria-label="Diff stats"',
			"2 files changed",
			"+12",
			"-3",
			"3 hunks",
			"1.5 KB",
		]);
	});

	test("wires refresh, select-file, and load-window callbacks", () => {
		const files = [diffFile(), diffFile({ path: "package.json", status: "added" })];
		const state = panelState({ summary: diffSummary({ files }) });
		let refreshCalls = 0;
		let selectedPath = "";
		let loadedPath = "";
		const tree = DiffPanel({
			state,
			onRefresh: () => {
				refreshCalls += 1;
			},
			onSelectFile: (filePath) => {
				selectedPath = filePath;
			},
			onLoadWindow: (filePath) => {
				loadedPath = filePath;
			},
		});

		click(findButtonByText(tree, "Refresh"));
		click(findButtonByText(tree, "package.json"));
		click(findButtonByText(tree, "Load diff window"));

		expect(refreshCalls).toBe(1);
		expect(selectedPath).toBe("package.json");
		expect(loadedPath).toBe("src/App.tsx");
	});

	test("renders large diff summary and windowed file callouts", () => {
		const largeFile = diffFile({
			path: "src/large.ts",
			isLarge: true,
			insertions: 80,
			deletions: 20,
			hunks: 10,
			byteLength: 4096,
		});
		const summary = diffSummary({
			files: [largeFile],
			filesChanged: 2,
			status: "large",
			insertions: 80,
			deletions: 20,
			totalBytes: 8192,
			isLarge: true,
			omittedFileCount: 1,
		});
		const window = diffWindow({
			filePath: "src/large.ts",
			isLarge: true,
			hasMoreAfter: true,
			nextCursor: { seq: 99 },
			chunks: [diffChunk({ text: "@@ -1 +1 @@\n-large\n+large updated" })],
		});
		const markup = renderMarkup(
			React.createElement(DiffPanel, {
				state: panelState({
					summary,
					selectedFilePath: "src/large.ts",
					fileWindowsByPath: { "src/large.ts": window },
				}),
			}),
		);

		expectMarkupContains(markup, [
			'data-testid="diff-large-summary"',
			"Large diff summary",
			"This diff is windowed",
			"1 omitted file",
			'data-testid="diff-large-file"',
			"Large diff is windowed",
			"More diff hunks are available.",
		]);
	});
});
