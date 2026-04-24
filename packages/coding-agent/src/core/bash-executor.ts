/**
 * Bash command execution with streaming support and cancellation.
 *
 * This module provides a unified bash execution implementation used by:
 * - AgentSession.executeBash() for interactive and RPC modes
 * - Direct calls from modes that need bash execution
 */

import { randomBytes } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import stripAnsi from "strip-ansi";
import { sanitizeBinaryOutput } from "../utils/shell.js";
import { DEFAULT_STDOUT_PREFIX_LINES, DEFAULT_STDOUT_SUFFIX_LINES } from "./tool-output-defaults.js";
import { type BashOperations, createLocalBashOperations } from "./tools/bash.js";
import { DEFAULT_MAX_BYTES } from "./tools/truncate.js";

class HeadTailOutputTracker {
	private readonly head: string[] = [];
	private readonly tail: string[] = [];
	private pending = "";
	private sawAnyText = false;
	private endedWithNewline = false;
	private totalLines = 0;
	private totalBytes = 0;

	constructor(
		private readonly prefixLines: number,
		private readonly suffixLines: number,
	) {}

	push(text: string): void {
		if (!text) return;
		this.sawAnyText = true;
		this.endedWithNewline = text.endsWith("\n");
		this.totalBytes += Buffer.byteLength(text, "utf-8");
		const combined = this.pending + text;
		const parts = combined.split("\n");
		this.pending = parts.pop() ?? "";
		for (const line of parts) {
			this.recordLine(line);
		}
	}

	finish(finalChunk = "") {
		this.push(finalChunk);
		if (this.pending.length > 0 || (this.sawAnyText && this.endedWithNewline)) {
			this.recordLine(this.pending);
			this.pending = "";
			this.endedWithNewline = false;
		}

		if (this.totalLines <= this.prefixLines + this.suffixLines) {
			const content = [...this.head, ...this.tail].join("\n");
			return {
				content,
				truncated: false,
				truncatedBy: null,
				totalLines: this.totalLines,
				totalBytes: this.totalBytes,
				outputLines: this.totalLines,
				outputBytes: Buffer.byteLength(content, "utf-8"),
				lastLinePartial: false,
				firstLineExceedsLimit: false,
				maxLines: this.prefixLines + this.suffixLines,
				maxBytes: DEFAULT_MAX_BYTES,
			};
		}

		const omittedLines = Math.max(0, this.totalLines - this.head.length - this.tail.length);
		const content = [...this.head, `[... ${omittedLines} lines truncated ...]`, ...this.tail].join("\n");
		return {
			content,
			truncated: true,
			truncatedBy: "lines",
			totalLines: this.totalLines,
			totalBytes: this.totalBytes,
			outputLines: this.head.length + this.tail.length + 1,
			outputBytes: Buffer.byteLength(content, "utf-8"),
			lastLinePartial: false,
			firstLineExceedsLimit: false,
			maxLines: this.prefixLines + this.suffixLines,
			maxBytes: DEFAULT_MAX_BYTES,
		};
	}

	private recordLine(line: string): void {
		this.totalLines += 1;
		if (this.head.length < this.prefixLines) {
			this.head.push(line);
			return;
		}
		if (this.suffixLines === 0) {
			return;
		}
		this.tail.push(line);
		if (this.tail.length > this.suffixLines) {
			this.tail.shift();
		}
	}
}

// ============================================================================
// Types
// ============================================================================

export interface BashExecutorOptions {
	/** Callback for streaming output chunks (already sanitized) */
	onChunk?: (chunk: string) => void;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
}

export interface BashResult {
	/** Combined stdout + stderr output (sanitized, possibly truncated) */
	output: string;
	/** Process exit code (undefined if killed/cancelled) */
	exitCode: number | undefined;
	/** Whether the command was cancelled via signal */
	cancelled: boolean;
	/** Whether the output was truncated */
	truncated: boolean;
	/** Path to temp file containing full output (if output exceeded truncation threshold) */
	fullOutputPath?: string;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Execute a bash command with optional streaming and cancellation support.
 *
 * Uses the same local BashOperations backend as createBashTool() so interactive
 * user bash and tool-invoked bash share the same process spawning behavior.
 * Sanitization, newline normalization, temp-file capture, and truncation still
 * happen in executeBashWithOperations(), so reusing the local backend does not
 * change output processing behavior.
 *
 * @param command - The bash command to execute
 * @param options - Optional streaming callback and abort signal
 * @returns Promise resolving to execution result
 */
export function executeBash(command: string, options?: BashExecutorOptions): Promise<BashResult> {
	return executeBashWithOperations(command, process.cwd(), createLocalBashOperations(), options);
}

/**
 * Execute a bash command using custom BashOperations.
 * Used for remote execution (SSH, containers, etc.).
 */
export async function executeBashWithOperations(
	command: string,
	cwd: string,
	operations: BashOperations,
	options?: BashExecutorOptions,
): Promise<BashResult> {
	const outputChunks: string[] = [];
	let outputBytes = 0;
	const maxOutputBytes = DEFAULT_MAX_BYTES * 2;
	const outputTracker = new HeadTailOutputTracker(DEFAULT_STDOUT_PREFIX_LINES, DEFAULT_STDOUT_SUFFIX_LINES);

	let tempFilePath: string | undefined;
	let tempFileStream: WriteStream | undefined;
	let totalBytes = 0;

	const ensureTempFile = () => {
		if (tempFilePath) {
			return;
		}
		const id = randomBytes(8).toString("hex");
		tempFilePath = join(tmpdir(), `pi-bash-${id}.log`);
		tempFileStream = createWriteStream(tempFilePath);
		for (const chunk of outputChunks) {
			tempFileStream.write(chunk);
		}
	};

	const decoder = new TextDecoder();

	const onData = (data: Buffer) => {
		totalBytes += data.length;

		// Sanitize: strip ANSI, replace binary garbage, normalize newlines
		const text = sanitizeBinaryOutput(stripAnsi(decoder.decode(data, { stream: true }))).replace(/\r/g, "");
		outputTracker.push(text);

		// Start writing to temp file if exceeds threshold
		if (totalBytes > DEFAULT_MAX_BYTES) {
			ensureTempFile();
		}

		if (tempFileStream) {
			tempFileStream.write(text);
		}

		// Keep rolling buffer
		outputChunks.push(text);
		outputBytes += text.length;
		while (outputBytes > maxOutputBytes && outputChunks.length > 1) {
			const removed = outputChunks.shift()!;
			outputBytes -= removed.length;
		}

		// Stream to callback
		if (options?.onChunk) {
			options.onChunk(text);
		}
	};

	try {
		const result = await operations.exec(command, cwd, {
			onData,
			signal: options?.signal,
		});

		if (tempFileStream) {
			tempFileStream.end();
		}

		const truncationResult = outputTracker.finish(
			sanitizeBinaryOutput(stripAnsi(decoder.decode())).replace(/\r/g, ""),
		);
		if (truncationResult.truncated) {
			ensureTempFile();
		}
		const cancelled = options?.signal?.aborted ?? false;
		const fullOutput = outputChunks.join("");

		return {
			output: truncationResult.truncated ? truncationResult.content : fullOutput,
			exitCode: cancelled ? undefined : (result.exitCode ?? undefined),
			cancelled,
			truncated: truncationResult.truncated,
			fullOutputPath: tempFilePath,
		};
	} catch (err) {
		if (tempFileStream) {
			tempFileStream.end();
		}

		// Check if it was an abort
		if (options?.signal?.aborted) {
			const truncationResult = outputTracker.finish(
				sanitizeBinaryOutput(stripAnsi(decoder.decode())).replace(/\r/g, ""),
			);
			if (truncationResult.truncated) {
				ensureTempFile();
			}
			const fullOutput = outputChunks.join("");
			return {
				output: truncationResult.truncated ? truncationResult.content : fullOutput,
				exitCode: undefined,
				cancelled: true,
				truncated: truncationResult.truncated,
				fullOutputPath: tempFilePath,
			};
		}

		throw err;
	}
}
