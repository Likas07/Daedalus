import { describe, expect, test } from "bun:test";
import type { Component } from "@daedalus-pi/tui";
import {
	type HistoryAnchorInput,
	measureHistoryAnchors,
	selectLastUserMessage,
	selectLatestAssistantMessage,
	selectNextMessage,
	selectPreviousMessage,
} from "./history-navigation.js";

function fixedLines(count: number): Component {
	return {
		render: () => Array.from({ length: count }, (_, index) => `line ${index}`),
		invalidate: () => {},
	};
}

function growingLines(initialCount: number): Component & { grow(lines: number): void } {
	let count = initialCount;
	return {
		render: () => Array.from({ length: count }, (_, index) => `stream ${index}`),
		grow: (lines: number) => {
			count += lines;
		},
		invalidate: () => {},
	};
}

describe("history navigation", () => {
	test("measures user and assistant anchors in render order", () => {
		const anchors: HistoryAnchorInput[] = [
			{ id: "u1", role: "user", component: fixedLines(2) },
			{ id: "a1", role: "assistant", component: fixedLines(3) },
			{ id: "u2", role: "user", component: fixedLines(1) },
		];

		expect(
			measureHistoryAnchors(anchors, 80).map(({ id, role, startLine, height, endLine }) => ({
				id,
				role,
				startLine,
				height,
				endLine,
			})),
		).toEqual([
			{ id: "u1", role: "user", startLine: 0, height: 2, endLine: 2 },
			{ id: "a1", role: "assistant", startLine: 2, height: 3, endLine: 5 },
			{ id: "u2", role: "user", startLine: 5, height: 1, endLine: 6 },
		]);
	});

	test("selects previous and next messages relative to viewport offset", () => {
		const measured = measureHistoryAnchors(
			[
				{ id: "u1", role: "user", component: fixedLines(2) },
				{ id: "a1", role: "assistant", component: fixedLines(3) },
				{ id: "u2", role: "user", component: fixedLines(1) },
			],
			80,
		);

		expect(selectPreviousMessage(measured, 4).anchor?.id).toBe("a1");
		expect(selectPreviousMessage(measured, 4).scrollOffset).toBe(2);
		expect(selectNextMessage(measured, 4).anchor?.id).toBe("u2");
		expect(selectNextMessage(measured, 4).scrollOffset).toBe(5);
	});

	test("selects last user and latest assistant messages", () => {
		const measured = measureHistoryAnchors(
			[
				{ id: "u1", role: "user", component: fixedLines(1) },
				{ id: "a1", role: "assistant", component: fixedLines(1) },
				{ id: "u2", role: "user", component: fixedLines(1) },
				{ id: "a2", role: "assistant", component: fixedLines(1) },
			],
			80,
		);

		expect(selectLastUserMessage(measured).anchor?.id).toBe("u2");
		expect(selectLastUserMessage(measured).scrollOffset).toBe(2);
		expect(selectLatestAssistantMessage(measured).anchor?.id).toBe("a2");
		expect(selectLatestAssistantMessage(measured).scrollOffset).toBe(3);
	});

	test("empty anchor list returns no anchor and top offset", () => {
		expect(selectPreviousMessage([], 10)).toEqual({ anchor: undefined, scrollOffset: 0 });
		expect(selectNextMessage([], 10)).toEqual({ anchor: undefined, scrollOffset: 0 });
		expect(selectLastUserMessage([])).toEqual({ anchor: undefined, scrollOffset: 0 });
		expect(selectLatestAssistantMessage([])).toEqual({ anchor: undefined, scrollOffset: 0 });
	});

	test("remeasures offsets when a streaming assistant grows", () => {
		const streaming = growingLines(1);
		const anchors: HistoryAnchorInput[] = [
			{ id: "u1", role: "user", component: fixedLines(2) },
			{ id: "a1", role: "assistant", component: streaming },
			{ id: "u2", role: "user", component: fixedLines(1) },
		];

		expect(measureHistoryAnchors(anchors, 80)[2]?.startLine).toBe(3);
		streaming.grow(4);
		expect(measureHistoryAnchors(anchors, 80)[2]?.startLine).toBe(7);
	});
});
