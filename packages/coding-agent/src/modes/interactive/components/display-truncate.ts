export interface TruncateForDisplayOnlyOptions {
	/** Whether to use the expanded line limit. Defaults to collapsed. */
	expanded?: boolean;
	/** Maximum newline-separated lines to show while collapsed. */
	collapsedLines: number;
	/** Maximum newline-separated lines to show while expanded. */
	expandedLines: number;
	/** Human-readable content label used in the truncation notice. */
	label?: string;
	/** Human-readable omitted-lines label used in the truncation notice. */
	omittedLabel?: string;
}

export interface TruncateForDisplayOnlyResult {
	/** Display-ready text. When truncated, includes a display-only notice. */
	text: string;
	/** True when at least one source line is omitted from display text. */
	truncated: boolean;
	/** Number of source lines omitted from display text. */
	omittedLines: number;
	/** Active line limit after sanitizing invalid values. */
	limit: number;
}

export interface FoldHeadTailForDisplayOnlyOptions {
	/** Maximum source lines to render including kept head and tail lines. */
	lineBudget: number;
	/** Preferred number of source lines to keep at the start. Defaults to half the budget, rounded up. */
	headLines?: number;
	/** Preferred number of source lines to keep at the end. Defaults to the remaining budget after head lines. */
	tailLines?: number;
	/** Human-readable full-content access paths used in the middle notice. */
	fullContentHint?: string;
}

export interface FoldHeadTailForDisplayOnlyResult {
	/** Display-ready text. When folded, includes a display-only middle notice. */
	text: string;
	/** True when at least one source line is hidden by display-only folding. */
	truncated: boolean;
	/** Number of source lines hidden by display-only folding. */
	hiddenLineCount: number;
	/** Total newline-separated line count in the source text. */
	totalLineCount: number;
	/** Number of source lines included in the display result, excluding the notice. */
	displayedLineCount: number;
	/** Sanitized active line budget. */
	lineBudget: number;
}

export type DisplayTruncateState = "collapsed" | "expanded";

export interface DisplayTruncateOptions {
	/** Text to prepare for display. The source string is never modified. */
	text: string;
	/** Maximum newline-separated lines to show in collapsed cards. */
	collapsedLineBudget: number;
	/** Maximum newline-separated lines to show in expanded cards. */
	expandedLineBudget: number;
	/** Whether the card is expanded. Defaults to collapsed. */
	expanded?: boolean;
	/** Human-readable content label used in the truncation notice. */
	label?: string;
	/** Human-readable omitted-lines label used in the truncation notice. */
	omittedLabel?: string;
}

export interface DisplayTruncateResult {
	/** Display state used to choose the active budget. */
	state: DisplayTruncateState;
	/** Active line budget after sanitizing invalid values. */
	lineBudget: number;
	/** Newline-separated lines selected for display, excluding the display-only notice. */
	lines: string[];
	/** Display-ready text reconstructed from selected lines plus any display-only notice. */
	text: string;
	/** Total newline-separated line count in the source text. */
	totalLineCount: number;
	/** Number of source lines included in the display result. */
	displayedLineCount: number;
	/** Number of source lines hidden by truncation. */
	hiddenLineCount: number;
	/** True when at least one source line is hidden. */
	truncated: boolean;
}

function normalizeLineLimit(lineLimit: number): number {
	if (!Number.isFinite(lineLimit) || lineLimit <= 0) {
		return 0;
	}

	return Math.floor(lineLimit);
}

function splitDisplayLines(text: string): string[] {
	return text.length === 0 ? [] : text.split("\n");
}

function buildDisplayOnlyNotice(omittedLines: number, label?: string, omittedLabel = "lines omitted"): string {
	const labelPrefix = label ? `${label}: ` : "";
	return `[Display-only truncation: ${labelPrefix}${omittedLines} ${omittedLabel}. Full content remains available to the model/tool result.]`;
}

function buildHeadTailNotice(hiddenLineCount: number, fullContentHint: string): string {
	return `… +${hiddenLineCount} lines (${fullContentHint})`;
}

/**
 * Prepare text for compact display by truncating newline-separated lines.
 *
 * This helper is intentionally display-only: truncation affects only rendered text.
 * The full source content remains available to the model/tool result.
 */
export function truncateForDisplayOnly(
	text: string,
	options: TruncateForDisplayOnlyOptions,
): TruncateForDisplayOnlyResult {
	const limit = normalizeLineLimit(options.expanded ? options.expandedLines : options.collapsedLines);
	const sourceLines = splitDisplayLines(text);
	const displayedLines = sourceLines.slice(0, limit);
	const omittedLines = Math.max(0, sourceLines.length - displayedLines.length);
	const truncated = omittedLines > 0;
	const displayText = displayedLines.join("\n");

	if (!truncated) {
		return { text: displayText, truncated, omittedLines, limit };
	}

	const notice = buildDisplayOnlyNotice(omittedLines, options.label, options.omittedLabel);
	return {
		text: displayText.length > 0 ? `${displayText}\n${notice}` : notice,
		truncated,
		omittedLines,
		limit,
	};
}

/**
 * Fold long text for display by keeping head and tail context with an explicit middle notice.
 *
 * This is display-only: callers must continue to use the original string for model/tool/raw paths.
 */
export function foldHeadTailForDisplayOnly(
	text: string,
	options: FoldHeadTailForDisplayOnlyOptions,
): FoldHeadTailForDisplayOnlyResult {
	const sourceLines = splitDisplayLines(text);
	const totalLineCount = sourceLines.length;
	const lineBudget = normalizeLineLimit(options.lineBudget);
	const fullContentHint = options.fullContentHint ?? "expand or open reader/export/editor for full content";

	if (totalLineCount <= lineBudget) {
		return {
			text,
			truncated: false,
			hiddenLineCount: 0,
			totalLineCount,
			displayedLineCount: totalLineCount,
			lineBudget,
		};
	}

	const requestedHead = options.headLines ?? Math.ceil(lineBudget / 2);
	const headLines = Math.min(normalizeLineLimit(requestedHead), lineBudget);
	const requestedTail = options.tailLines ?? lineBudget - headLines;
	const tailLines = Math.min(normalizeLineLimit(requestedTail), lineBudget - headLines);
	const hiddenLineCount = Math.max(0, totalLineCount - headLines - tailLines);
	const lines = [
		...sourceLines.slice(0, headLines),
		buildHeadTailNotice(hiddenLineCount, fullContentHint),
		...sourceLines.slice(totalLineCount - tailLines),
	];

	return {
		text: lines.join("\n"),
		truncated: true,
		hiddenLineCount,
		totalLineCount,
		displayedLineCount: headLines + tailLines,
		lineBudget,
	};
}

/**
 * Compatibility wrapper for older renderer experiments. New code should import
 * truncateForDisplayOnly(text, options).
 */
export function truncateDisplayText(options: DisplayTruncateOptions): DisplayTruncateResult {
	const state: DisplayTruncateState = options.expanded ? "expanded" : "collapsed";
	const sourceLines = splitDisplayLines(options.text);
	const result = truncateForDisplayOnly(options.text, {
		expanded: options.expanded,
		collapsedLines: options.collapsedLineBudget,
		expandedLines: options.expandedLineBudget,
		label: options.label,
		omittedLabel: options.omittedLabel,
	});
	const lineBudget = result.limit;
	const lines = sourceLines.slice(0, lineBudget);
	const displayedLineCount = lines.length;

	return {
		state,
		lineBudget,
		lines,
		text: result.text,
		totalLineCount: sourceLines.length,
		displayedLineCount,
		hiddenLineCount: result.omittedLines,
		truncated: result.truncated,
	};
}
