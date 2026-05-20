import { type Component, renderComponentWithMetadata } from "@daedalus-pi/tui";

export type HistoryAnchorRole = "user" | "assistant";

export interface HistoryAnchorInput {
	id: string;
	role: HistoryAnchorRole;
	component: Component;
}

export interface MeasuredHistoryAnchor {
	id: string;
	role: HistoryAnchorRole;
	component: Component;
	startLine: number;
	height: number;
	endLine: number;
}

export interface HistoryAnchorSelection {
	anchor: MeasuredHistoryAnchor | undefined;
	scrollOffset: number;
}

export function measureHistoryAnchors(anchors: readonly HistoryAnchorInput[], width: number): MeasuredHistoryAnchor[] {
	let startLine = 0;
	return anchors.map((anchor) => {
		const height = renderComponentWithMetadata(anchor.component, width).length;
		const measured = {
			...anchor,
			startLine,
			height,
			endLine: startLine + height,
		};
		startLine += height;
		return measured;
	});
}

export function selectPreviousMessage(
	anchors: readonly MeasuredHistoryAnchor[],
	viewportOffset: number,
): HistoryAnchorSelection {
	const anchor = [...anchors].reverse().find((candidate) => candidate.startLine < viewportOffset);
	return toSelection(anchor);
}

export function selectNextMessage(
	anchors: readonly MeasuredHistoryAnchor[],
	viewportOffset: number,
): HistoryAnchorSelection {
	const anchor = anchors.find((candidate) => candidate.startLine > viewportOffset);
	return toSelection(anchor);
}

export function selectLastUserMessage(anchors: readonly MeasuredHistoryAnchor[]): HistoryAnchorSelection {
	const anchor = [...anchors].reverse().find((candidate) => candidate.role === "user");
	return toSelection(anchor);
}

export function selectLatestAssistantMessage(anchors: readonly MeasuredHistoryAnchor[]): HistoryAnchorSelection {
	const anchor = [...anchors].reverse().find((candidate) => candidate.role === "assistant");
	return toSelection(anchor);
}

function toSelection(anchor: MeasuredHistoryAnchor | undefined): HistoryAnchorSelection {
	return { anchor, scrollOffset: anchor?.startLine ?? 0 };
}
