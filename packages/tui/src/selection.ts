import type { RenderedLine } from "./render-metadata.js";
import { sliceByColumn, visibleWidth } from "./utils.js";

export interface SelectionPoint {
	row: number;
	col: number;
}

export interface SelectionRange {
	start: SelectionPoint;
	end: SelectionPoint;
}

export interface SgrMouseEvent {
	button: number;
	col: number;
	row: number;
	type: "press" | "release";
	wheel: "up" | "down" | null;
}

const SELECT_START = "\x1b[7m";
const SELECT_END = "\x1b[27m";

export function parseSgrMouse(input: string): SgrMouseEvent | null {
	const match = input.match(/^\x1b\[<(\d+);(\d+);(\d+)([mM])$/);
	if (!match) return null;
	const button = Number(match[1]);
	const col = Number(match[2]) - 1;
	const row = Number(match[3]) - 1;
	if (!Number.isFinite(button) || !Number.isFinite(col) || !Number.isFinite(row) || col < 0 || row < 0) return null;
	const wheel = button === 64 ? "up" : button === 65 ? "down" : null;
	return { button, col, row, type: match[4] === "m" ? "release" : "press", wheel };
}

function orderedRange(a: SelectionPoint, b: SelectionPoint): SelectionRange {
	if (a.row < b.row || (a.row === b.row && a.col <= b.col)) return { start: a, end: b };
	return { start: b, end: a };
}

function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}

export class SelectionState {
	private anchor: SelectionPoint | null = null;
	private focus: SelectionPoint | null = null;
	private dragging = false;

	clear(): void {
		this.anchor = null;
		this.focus = null;
		this.dragging = false;
	}

	start(point: SelectionPoint): void {
		this.anchor = { ...point };
		this.focus = { ...point };
		this.dragging = true;
	}

	update(point: SelectionPoint): void {
		if (!this.dragging || !this.anchor) return;
		this.focus = { ...point };
	}

	finish(point?: SelectionPoint): SelectionRange | null {
		if (point) this.update(point);
		this.dragging = false;
		return this.range;
	}

	get active(): boolean {
		return (
			this.anchor !== null &&
			this.focus !== null &&
			(this.anchor.row !== this.focus.row || this.anchor.col !== this.focus.col)
		);
	}

	get range(): SelectionRange | null {
		if (!this.anchor || !this.focus || !this.active) return null;
		return orderedRange(this.anchor, this.focus);
	}
}

export function applySelectionHighlight(lines: RenderedLine[], range: SelectionRange | null): string[] {
	if (!range) return lines.map((line) => line.text);
	return lines.map((line, row) => {
		const width = visibleWidth(line.text);
		const start = row === range.start.row ? range.start.col : row > range.start.row && row <= range.end.row ? 0 : -1;
		const end = row === range.end.row ? range.end.col : row >= range.start.row && row < range.end.row ? width : -1;
		if (start < 0 || end <= start) return line.text;
		const before = sliceByColumn(line.text, 0, start, true);
		const middle = sliceByColumn(line.text, start, end - start, true);
		const after = sliceByColumn(line.text, end, Math.max(0, width - end), true);
		return before + SELECT_START + middle + SELECT_END + after;
	});
}

export function extractSelectedText(lines: RenderedLine[], range: SelectionRange | null): string {
	if (!range) return "";
	let result = "";
	for (let row = range.start.row; row <= range.end.row; row++) {
		const line = lines[row];
		if (!line) {
			if (result.length > 0) result += "\n";
			continue;
		}
		const width = visibleWidth(line.text);
		const start = row === range.start.row ? range.start.col : 0;
		const end = row === range.end.row ? range.end.col : width;
		let text = stripAnsi(sliceByColumn(line.text, start, Math.max(0, end - start), true));
		if (line.noSelect?.some(Boolean)) {
			let filtered = "";
			for (let col = start; col < end; col++) {
				if (line.noSelect[col]) continue;
				filtered += stripAnsi(sliceByColumn(line.text, col, 1, true));
			}
			text = filtered;
		}
		if (result.length > 0 && !line.softWrap) result += "\n";
		const continuesToNextVisualRow = row < range.end.row && lines[row + 1]?.softWrap;
		result += continuesToNextVisualRow ? text : text.replace(/[ \t]+$/g, "");
	}
	return result;
}
