/**
 * Shared truncation utilities for tool outputs.
 *
 * Truncation is based on two independent limits - whichever is hit first wins:
 * - Line limit (default: 2000 lines)
 * - Byte limit (default: 50KB)
 *
 * Never returns partial lines (except bash tail truncation edge case).
 */

export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
export const GREP_MAX_LINE_LENGTH = 500; // Max chars per grep match line

export interface TruncationResult {
	/** The truncated content */
	content: string;
	/** Whether truncation occurred */
	truncated: boolean;
	/** Which limit was hit: "lines", "bytes", or null if not truncated */
	truncatedBy: "lines" | "bytes" | null;
	/** Total number of lines in the original content */
	totalLines: number;
	/** Total number of bytes in the original content */
	totalBytes: number;
	/** Number of complete lines in the truncated output */
	outputLines: number;
	/** Number of bytes in the truncated output */
	outputBytes: number;
	/** Whether the last line was partially truncated (only for tail truncation edge case) */
	lastLinePartial: boolean;
	/** Whether the first line exceeded the byte limit (for head truncation) */
	firstLineExceedsLimit: boolean;
	/** The max lines limit that was applied */
	maxLines: number;
	/** The max bytes limit that was applied */
	maxBytes: number;
}

export interface TruncationOptions {
	/** Maximum number of lines (default: 2000) */
	maxLines?: number;
	/** Maximum number of bytes (default: 50KB) */
	maxBytes?: number;
}

export interface HeadTailTruncationOptions {
	/** Maximum number of lines to keep from the beginning */
	maxPrefixLines?: number;
	/** Maximum number of bytes to keep from the beginning */
	maxPrefixBytes?: number;
	/** Maximum number of lines to keep from the end */
	maxSuffixLines?: number;
	/** Maximum number of bytes to keep from the end */
	maxSuffixBytes?: number;
}

/**
 * Format bytes as human-readable size.
 */
export function formatSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes}B`;
	} else if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)}KB`;
	} else {
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}
}

/**
 * Truncate content from the head (keep first N lines/bytes).
 * Suitable for file reads where you want to see the beginning.
 *
 * Never returns partial lines. If first line exceeds byte limit,
 * returns empty content with firstLineExceedsLimit=true.
 */
export function truncateHead(content: string, options: TruncationOptions = {}): TruncationResult {
	const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

	const totalBytes = Buffer.byteLength(content, "utf-8");
	const lines = content.split("\n");
	const totalLines = lines.length;

	// Check if no truncation needed
	if (totalLines <= maxLines && totalBytes <= maxBytes) {
		return {
			content,
			truncated: false,
			truncatedBy: null,
			totalLines,
			totalBytes,
			outputLines: totalLines,
			outputBytes: totalBytes,
			lastLinePartial: false,
			firstLineExceedsLimit: false,
			maxLines,
			maxBytes,
		};
	}

	// Check if first line alone exceeds byte limit
	const firstLineBytes = Buffer.byteLength(lines[0], "utf-8");
	if (firstLineBytes > maxBytes) {
		return {
			content: "",
			truncated: true,
			truncatedBy: "bytes",
			totalLines,
			totalBytes,
			outputLines: 0,
			outputBytes: 0,
			lastLinePartial: false,
			firstLineExceedsLimit: true,
			maxLines,
			maxBytes,
		};
	}

	// Collect complete lines that fit
	const outputLinesArr: string[] = [];
	let outputBytesCount = 0;
	let truncatedBy: "lines" | "bytes" = "lines";

	for (let i = 0; i < lines.length && i < maxLines; i++) {
		const line = lines[i];
		const lineBytes = Buffer.byteLength(line, "utf-8") + (i > 0 ? 1 : 0); // +1 for newline

		if (outputBytesCount + lineBytes > maxBytes) {
			truncatedBy = "bytes";
			break;
		}

		outputLinesArr.push(line);
		outputBytesCount += lineBytes;
	}

	// If we exited due to line limit
	if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
		truncatedBy = "lines";
	}

	const outputContent = outputLinesArr.join("\n");
	const finalOutputBytes = Buffer.byteLength(outputContent, "utf-8");

	return {
		content: outputContent,
		truncated: true,
		truncatedBy,
		totalLines,
		totalBytes,
		outputLines: outputLinesArr.length,
		outputBytes: finalOutputBytes,
		lastLinePartial: false,
		firstLineExceedsLimit: false,
		maxLines,
		maxBytes,
	};
}

/**
 * Truncate content from the tail (keep last N lines/bytes).
 * Suitable for bash output where you want to see the end (errors, final results).
 *
 * May return partial first line if the last line of original content exceeds byte limit.
 */
export function truncateTail(content: string, options: TruncationOptions = {}): TruncationResult {
	const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

	const totalBytes = Buffer.byteLength(content, "utf-8");
	const lines = content.split("\n");
	const totalLines = lines.length;

	// Check if no truncation needed
	if (totalLines <= maxLines && totalBytes <= maxBytes) {
		return {
			content,
			truncated: false,
			truncatedBy: null,
			totalLines,
			totalBytes,
			outputLines: totalLines,
			outputBytes: totalBytes,
			lastLinePartial: false,
			firstLineExceedsLimit: false,
			maxLines,
			maxBytes,
		};
	}

	// Work backwards from the end
	const outputLinesArr: string[] = [];
	let outputBytesCount = 0;
	let truncatedBy: "lines" | "bytes" = "lines";
	let lastLinePartial = false;

	for (let i = lines.length - 1; i >= 0 && outputLinesArr.length < maxLines; i--) {
		const line = lines[i];
		const lineBytes = Buffer.byteLength(line, "utf-8") + (outputLinesArr.length > 0 ? 1 : 0); // +1 for newline

		if (outputBytesCount + lineBytes > maxBytes) {
			truncatedBy = "bytes";
			// Edge case: if we haven't added ANY lines yet and this line exceeds maxBytes,
			// take the end of the line (partial)
			if (outputLinesArr.length === 0) {
				const truncatedLine = truncateStringToBytesFromEnd(line, maxBytes);
				outputLinesArr.unshift(truncatedLine);
				outputBytesCount = Buffer.byteLength(truncatedLine, "utf-8");
				lastLinePartial = true;
			}
			break;
		}

		outputLinesArr.unshift(line);
		outputBytesCount += lineBytes;
	}

	// If we exited due to line limit
	if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
		truncatedBy = "lines";
	}

	const outputContent = outputLinesArr.join("\n");
	const finalOutputBytes = Buffer.byteLength(outputContent, "utf-8");

	return {
		content: outputContent,
		truncated: true,
		truncatedBy,
		totalLines,
		totalBytes,
		outputLines: outputLinesArr.length,
		outputBytes: finalOutputBytes,
		lastLinePartial,
		firstLineExceedsLimit: false,
		maxLines,
		maxBytes,
	};
}

export function truncateHeadAndTail(content: string, options: HeadTailTruncationOptions = {}): TruncationResult {
	const totalBytes = Buffer.byteLength(content, "utf-8");
	const lines = content.split("\n");
	const totalLines = lines.length;

	const maxPrefixLines = normalizeLimit(options.maxPrefixLines, totalLines);
	const maxSuffixLines = normalizeLimit(options.maxSuffixLines, totalLines);
	const maxPrefixBytes = normalizeLimit(options.maxPrefixBytes, totalBytes);
	const maxSuffixBytes = normalizeLimit(options.maxSuffixBytes, totalBytes);

	const prefixByLines = takePrefixLines(content, maxPrefixLines);
	const prefixByBytes = takePrefixBytes(content, maxPrefixBytes);
	const suffixByLines = takeSuffixLines(content, maxSuffixLines);
	const suffixByBytes = takeSuffixBytes(content, maxSuffixBytes);
	const prefixEnd = Math.min(prefixByLines.end, prefixByBytes.end);
	const suffixStart = Math.max(suffixByLines.start, suffixByBytes.start);

	if (
		prefixEnd >= suffixStart ||
		(totalLines <= maxPrefixLines + maxSuffixLines && totalBytes <= maxPrefixBytes + maxSuffixBytes)
	) {
		return {
			content,
			truncated: false,
			truncatedBy: null,
			totalLines,
			totalBytes,
			outputLines: totalLines,
			outputBytes: totalBytes,
			lastLinePartial: false,
			firstLineExceedsLimit: false,
			maxLines: maxPrefixLines + maxSuffixLines,
			maxBytes: maxPrefixBytes + maxSuffixBytes,
		};
	}

	const prefix = content.slice(0, prefixEnd);
	const suffix = content.slice(suffixStart);
	const omittedContent = content.slice(prefixEnd, suffixStart);
	const omittedBytes = Buffer.byteLength(omittedContent, "utf-8");
	const omittedLines = countOmittedLines(content, prefixEnd, suffixStart);
	const marker =
		omittedLines > 0 ? `[... ${omittedLines} lines truncated ...]` : `[... ${omittedBytes} bytes truncated ...]`;
	const outputContent = joinHeadTailSegments(prefix, marker, suffix);
	const outputBytes = Buffer.byteLength(outputContent, "utf-8");
	const outputLines = outputContent.length === 0 ? 0 : outputContent.split("\n").length;

	return {
		content: outputContent,
		truncated: true,
		truncatedBy: omittedLines > 0 ? "lines" : "bytes",
		totalLines,
		totalBytes,
		outputLines,
		outputBytes,
		lastLinePartial: false,
		firstLineExceedsLimit: false,
		maxLines: maxPrefixLines + maxSuffixLines,
		maxBytes: maxPrefixBytes + maxSuffixBytes,
	};
}

/**
 * Truncate a string to fit within a byte limit (from the end).
 * Handles multi-byte UTF-8 characters correctly.
 */
function truncateStringToBytesFromEnd(str: string, maxBytes: number): string {
	const buf = Buffer.from(str, "utf-8");
	if (buf.length <= maxBytes) {
		return str;
	}

	// Start from the end, skip maxBytes back
	let start = buf.length - maxBytes;

	// Find a valid UTF-8 boundary (start of a character)
	while (start < buf.length && (buf[start] & 0xc0) === 0x80) {
		start++;
	}

	return buf.slice(start).toString("utf-8");
}

function normalizeLimit(value: number | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	if (!Number.isFinite(value)) return fallback;
	return Math.max(0, Math.floor(value));
}

function takePrefixLines(content: string, maxLines: number): { end: number } {
	if (maxLines <= 0 || content.length === 0) return { end: 0 };
	const lines = content.split("\n");
	if (lines.length <= maxLines) return { end: content.length };
	return { end: lines.slice(0, maxLines).join("\n").length };
}

function takeSuffixLines(content: string, maxLines: number): { start: number } {
	if (maxLines <= 0 || content.length === 0) return { start: content.length };
	const lines = content.split("\n");
	if (lines.length <= maxLines) return { start: 0 };
	const suffix = lines.slice(-maxLines).join("\n");
	return { start: content.length - suffix.length };
}

function takePrefixBytes(content: string, maxBytes: number): { end: number } {
	if (maxBytes <= 0 || content.length === 0) return { end: 0 };
	let bytes = 0;
	let end = 0;
	for (const char of content) {
		const charBytes = Buffer.byteLength(char, "utf-8");
		if (bytes + charBytes > maxBytes) break;
		bytes += charBytes;
		end += char.length;
	}
	return { end };
}

function takeSuffixBytes(content: string, maxBytes: number): { start: number } {
	if (maxBytes <= 0 || content.length === 0) return { start: content.length };
	let bytes = 0;
	let start = content.length;
	let index = content.length;
	while (index > 0) {
		const codeUnit = content.charCodeAt(index - 1);
		const charLength = codeUnit >= 0xdc00 && codeUnit <= 0xdfff ? 2 : 1;
		const charStart = index - charLength;
		const char = content.slice(charStart, index);
		const charBytes = Buffer.byteLength(char, "utf-8");
		if (bytes + charBytes > maxBytes) break;
		bytes += charBytes;
		start = charStart;
		index = charStart;
	}
	return { start };
}

function countOmittedLines(content: string, prefixEnd: number, suffixStart: number): number {
	const lines = content.split("\n");
	let cursor = 0;
	let omitted = 0;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const lineStart = cursor;
		const lineEnd = cursor + line.length;
		if (lineStart >= prefixEnd && lineEnd < suffixStart) {
			omitted += 1;
		}
		cursor = lineEnd + 1;
	}
	return omitted;
}

function joinHeadTailSegments(prefix: string, marker: string, suffix: string): string {
	const segments: string[] = [];
	if (prefix) segments.push(prefix);
	segments.push(marker);
	if (suffix) segments.push(suffix);
	return segments.join("\n");
}

/**
 * Truncate a single line to max characters, adding [truncated] suffix.
 * Used for grep match lines.
 */
export function truncateLine(
	line: string,
	maxChars: number = GREP_MAX_LINE_LENGTH,
): { text: string; wasTruncated: boolean } {
	if (line.length <= maxChars) {
		return { text: line, wasTruncated: false };
	}
	return { text: `${line.slice(0, maxChars)}... [truncated]`, wasTruncated: true };
}
