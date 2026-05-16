import type { Component } from "./tui.js";

/** A rendered terminal line plus per-column copy/selection metadata. */
export interface RenderedLine {
	text: string;
	/** True entries mark display columns that should be excluded from copied selections. */
	noSelect?: boolean[];
	/** True when this visual row continues the previous logical line for copy extraction. */
	softWrap?: boolean;
}

/** Return the string content for a rendered line. */
export function renderedLineText(line: RenderedLine): string {
	return line.text;
}

/** Convert a legacy rendered string into a metadata-capable rendered line. */
export function toRenderedLine(text: string): RenderedLine {
	return { text };
}

/** Clone a rendered line without sharing mutable metadata arrays. */
export function cloneRenderedLine(line: RenderedLine): RenderedLine {
	return {
		text: line.text,
		...(line.noSelect ? { noSelect: [...line.noSelect] } : {}),
		...(line.softWrap ? { softWrap: true } : {}),
	};
}

/** Render a component using metadata output when available, otherwise legacy strings. */
export function renderComponentWithMetadata(component: Component, width: number): RenderedLine[] {
	return component.renderWithMetadata?.(width).map(cloneRenderedLine) ?? component.render(width).map(toRenderedLine);
}

/** Ensure a line has a no-select bitmap at least width columns wide. */
export function ensureNoSelectWidth(line: RenderedLine, width: number): boolean[] {
	if (!line.noSelect) {
		line.noSelect = [];
	}
	while (line.noSelect.length < width) {
		line.noSelect.push(false);
	}
	return line.noSelect;
}

/** Mark the half-open column range [startColumn, endColumn) as no-select. */
export function markNoSelectColumns(line: RenderedLine, startColumn: number, endColumn: number): RenderedLine {
	const start = Math.max(0, Math.floor(startColumn));
	const end = Math.max(start, Math.floor(endColumn));
	const noSelect = ensureNoSelectWidth(line, end);
	for (let column = start; column < end; column++) {
		noSelect[column] = true;
	}
	return line;
}
