import { type DiffV1RequestClient, getDiffFileWindow, getDiffSummary } from "@daedalus-pi/app-server-client";
import { DiffPanel as DiffPanelView } from "@daedalus-pi/gui-components";
import { createInitialDiffPanelState, type DiffPanelState, diffPanelReducer } from "@daedalus-pi/gui-core/diff/reducer";
import React, { type ReactNode } from "react";

interface ReactHookRuntime {
	useEffect(effect: () => undefined | (() => void), dependencies: readonly unknown[]): void;
	useState<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
}

const ReactHooks = React as unknown as ReactHookRuntime;

export interface DiffPanelProps {
	readonly client: DiffV1RequestClient;
	readonly threadId: string;
	readonly workspaceTargetId?: string;
	readonly turnId?: string;
	readonly checkpointId?: string;
}

export function DiffPanel({ client, threadId, workspaceTargetId, turnId, checkpointId }: DiffPanelProps): ReactNode {
	const [state, setState] = ReactHooks.useState<DiffPanelState>(() =>
		createInitialDiffPanelState({ threadId, workspaceTargetId }),
	);
	const dispatch = (action: Parameters<typeof diffPanelReducer>[1]) =>
		setState((current) => diffPanelReducer(current, action));

	const effectiveTurnId = turnId ?? `turn:${threadId}`;
	const effectiveCheckpointId = checkpointId ?? `checkpoint:${threadId}`;

	const refresh = async () => {
		if (!workspaceTargetId) return;
		dispatch({ type: "diff.summaryLoading", threadId, workspaceTargetId });
		try {
			const result = await getDiffSummary(client, {
				threadId,
				workspaceTargetId,
				turnId: effectiveTurnId,
				checkpointId: effectiveCheckpointId,
			});
			if (result.ok) dispatch({ type: "diff.summaryLoaded", result });
			else dispatch({ type: "diff.summaryFailed", failure: result });
		} catch (error) {
			dispatch({ type: "diff.error", error: error instanceof Error ? error.message : String(error) });
		}
	};

	ReactHooks.useEffect(() => {
		void refresh();
		return undefined;
	}, [client, threadId, workspaceTargetId, effectiveTurnId, effectiveCheckpointId]);

	const loadWindow = async (filePath: string) => {
		if (!workspaceTargetId || !state.summary) return;
		dispatch({ type: "diff.fileLoading", filePath });
		try {
			const result = await getDiffFileWindow(client, {
				diffId: state.summary.diffId,
				threadId,
				workspaceTargetId,
				turnId: effectiveTurnId,
				checkpointId: effectiveCheckpointId,
				filePath,
				limit: 100,
			});
			if (result.ok) dispatch({ type: "diff.fileWindowLoaded", result });
			else dispatch({ type: "diff.fileWindowFailed", failure: result });
		} catch (error) {
			dispatch({ type: "diff.error", error: error instanceof Error ? error.message : String(error) });
		}
	};

	return React.createElement(DiffPanelView, {
		state,
		onRefresh: refresh,
		onSelectFile: (filePath: string) => dispatch({ type: "diff.fileSelected", filePath }),
		onLoadWindow: loadWindow,
	});
}
