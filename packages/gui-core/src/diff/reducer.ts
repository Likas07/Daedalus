import type { protocolV1 } from "@daedalus-pi/app-server-protocol";

export interface DiffPanelState {
	readonly threadId?: string;
	readonly workspaceTargetId?: string;
	readonly summary?: protocolV1.DiffSummary;
	readonly selectedFilePath?: string;
	readonly fileWindowsByPath: Readonly<Record<string, protocolV1.DiffFileWindow>>;
	readonly isSummaryLoading: boolean;
	readonly loadingFilePath?: string;
	readonly failure?: protocolV1.DiffFailure;
	readonly error?: string;
}

export type DiffPanelAction =
	| { readonly type: "diff.summaryLoading"; readonly threadId?: string; readonly workspaceTargetId?: string }
	| { readonly type: "diff.summaryLoaded"; readonly result: protocolV1.DiffSummarySuccess }
	| { readonly type: "diff.summaryFailed"; readonly failure: protocolV1.DiffFailure }
	| { readonly type: "diff.fileSelected"; readonly filePath: string }
	| { readonly type: "diff.fileLoading"; readonly filePath: string }
	| { readonly type: "diff.fileWindowLoaded"; readonly result: protocolV1.DiffFileWindowSuccess }
	| { readonly type: "diff.fileWindowFailed"; readonly failure: protocolV1.DiffFailure }
	| { readonly type: "diff.error"; readonly error: string };

export function createInitialDiffPanelState(
	input: { readonly threadId?: string; readonly workspaceTargetId?: string } = {},
): DiffPanelState {
	return {
		threadId: input.threadId,
		workspaceTargetId: input.workspaceTargetId,
		fileWindowsByPath: {},
		isSummaryLoading: false,
	};
}

export function diffPanelReducer(
	state: DiffPanelState = createInitialDiffPanelState(),
	action: DiffPanelAction,
): DiffPanelState {
	switch (action.type) {
		case "diff.summaryLoading":
			return {
				...state,
				threadId: action.threadId ?? state.threadId,
				workspaceTargetId: action.workspaceTargetId ?? state.workspaceTargetId,
				isSummaryLoading: true,
				failure: undefined,
				error: undefined,
			};
		case "diff.summaryLoaded": {
			const selectedFilePath =
				state.selectedFilePath && action.result.summary.files.some((file) => file.path === state.selectedFilePath)
					? state.selectedFilePath
					: action.result.summary.files[0]?.path;
			return {
				...state,
				threadId: action.result.summary.threadId,
				workspaceTargetId: action.result.summary.workspaceTargetId,
				summary: action.result.summary,
				selectedFilePath,
				isSummaryLoading: false,
				failure: undefined,
				error: undefined,
			};
		}
		case "diff.summaryFailed":
			return { ...state, isSummaryLoading: false, failure: action.failure, error: action.failure.message };
		case "diff.fileSelected":
			return { ...state, selectedFilePath: action.filePath, failure: undefined, error: undefined };
		case "diff.fileLoading":
			return { ...state, selectedFilePath: action.filePath, loadingFilePath: action.filePath, failure: undefined };
		case "diff.fileWindowLoaded":
			return {
				...state,
				selectedFilePath: action.result.window.filePath,
				loadingFilePath: undefined,
				fileWindowsByPath: { ...state.fileWindowsByPath, [action.result.window.filePath]: action.result.window },
				failure: undefined,
				error: undefined,
			};
		case "diff.fileWindowFailed":
			return { ...state, loadingFilePath: undefined, failure: action.failure, error: action.failure.message };
		case "diff.error":
			return { ...state, isSummaryLoading: false, loadingFilePath: undefined, error: action.error };
	}
}

export function selectDiffFiles(state: DiffPanelState): readonly protocolV1.DiffFileSummary[] {
	return state.summary?.files ?? [];
}

export function selectSelectedDiffFile(state: DiffPanelState): protocolV1.DiffFileSummary | undefined {
	return state.summary?.files.find((file) => file.path === state.selectedFilePath);
}

export function selectSelectedDiffWindow(state: DiffPanelState): protocolV1.DiffFileWindow | undefined {
	return state.selectedFilePath ? state.fileWindowsByPath[state.selectedFilePath] : undefined;
}
