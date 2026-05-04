export interface LineRange {
	start: number;
	end: number;
}

export interface ScrollPanelResult {
	lines: string[];
	scrollOffset: number;
}

export function clampScrollOffset(offset: number, totalLines: number, viewportHeight: number): number {
	if (totalLines <= 0 || viewportHeight <= 0) return 0;
	const maxOffset = Math.max(0, totalLines - viewportHeight);
	return Math.min(maxOffset, Math.max(0, offset));
}

export function ensureRangeVisible(
	offset: number,
	viewportHeight: number,
	range: LineRange | undefined,
	totalLines: number,
): number {
	if (!range || totalLines <= 0 || viewportHeight <= 0) return clampScrollOffset(offset, totalLines, viewportHeight);

	const capacity = Math.max(1, viewportHeight - 1);
	let nextOffset = offset;
	const start = Math.max(0, Math.min(range.start, totalLines));
	const end = Math.max(start + 1, Math.min(range.end, totalLines));

	if (start < nextOffset) {
		nextOffset = start;
	} else if (end > nextOffset + capacity) {
		nextOffset = end - capacity;
	}

	return clampScrollOffset(nextOffset, totalLines, viewportHeight);
}

export function renderScrollPanel(
	body: string[],
	viewportHeight: number,
	scrollOffset: number,
	renderIndicator: (direction: "up" | "down") => string,
): ScrollPanelResult {
	if (viewportHeight <= 0) return { lines: [], scrollOffset: 0 };
	if (body.length <= viewportHeight) return { lines: body, scrollOffset: 0 };

	let offset = clampScrollOffset(scrollOffset, body.length, viewportHeight);
	let hasTop = offset > 0;
	let hasBottom = false;
	let bodyRows = viewportHeight;

	for (let i = 0; i < 3; i++) {
		bodyRows = Math.max(0, viewportHeight - (hasTop ? 1 : 0) - (hasBottom ? 1 : 0));
		offset = clampScrollOffset(offset, body.length, bodyRows);
		hasTop = offset > 0;
		hasBottom = offset + bodyRows < body.length;
	}

	bodyRows = Math.max(0, viewportHeight - (hasTop ? 1 : 0) - (hasBottom ? 1 : 0));
	const lines: string[] = [];
	if (hasTop) lines.push(renderIndicator("up"));
	lines.push(...body.slice(offset, offset + bodyRows));
	if (hasBottom) lines.push(renderIndicator("down"));

	return { lines, scrollOffset: offset };
}

export function defaultScrollableRenderHeight(terminalRows: unknown): number | undefined {
	if (typeof terminalRows !== "number" || !Number.isFinite(terminalRows) || terminalRows <= 0) return undefined;

	const rows = Math.floor(terminalRows);
	const targetRows = Math.max(8, Math.floor(rows * 0.7));
	const reservedRows = rows >= 12 ? 3 : 2;
	return Math.max(1, Math.min(targetRows, rows - reservedRows));
}
