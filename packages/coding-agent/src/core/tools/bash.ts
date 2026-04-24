import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { AgentTool } from "@daedalus-pi/agent-core";
import { Container, Text, truncateToWidth } from "@daedalus-pi/tui";
import { type Static, Type } from "@sinclair/typebox";
import { spawn } from "child_process";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import { truncateToVisualLines } from "../../modes/interactive/components/visual-truncate.js";
import { theme } from "../../modes/interactive/theme/theme.js";
import { waitForChildProcess } from "../../utils/child-process.js";
import { getShellConfig, getShellEnv, killProcessTree } from "../../utils/shell.js";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import type { ToolOutputSettings } from "../settings-manager.js";
import { DEFAULT_STDOUT_PREFIX_LINES, DEFAULT_STDOUT_SUFFIX_LINES } from "../tool-output-defaults.js";
import type { ArtifactStore } from "./artifact-store.js";
import { getTextOutput, invalidArgText, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, type TruncationResult, truncateTail } from "./truncate.js";
import { formatVisiblePath } from "./visible-path.js";

/**
 * Generate a unique temp file path for bash output.
 */
function getTempFilePath(): string {
	const id = randomBytes(8).toString("hex");
	return join(tmpdir(), `pi-bash-${id}.log`);
}

const bashSchema = Type.Object({
	command: Type.String({ description: "Bash command to execute" }),
	timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" })),
});

export type BashToolInput = Static<typeof bashSchema>;

export interface BashToolDetails {
	truncation?: TruncationResult;
	fullOutputPath?: string;
	stdoutArtifactPath?: string;
	stderrArtifactPath?: string;
}

/**
 * Pluggable operations for the bash tool.
 * Override these to delegate command execution to remote systems (for example SSH).
 */
export interface BashOperations {
	/**
	 * Execute a command and stream output.
	 * @param command The command to execute
	 * @param cwd Working directory
	 * @param options Execution options
	 * @returns Promise resolving to exit code (null if killed)
	 */
	exec: (
		command: string,
		cwd: string,
		options: {
			onData: (data: Buffer) => void;
			onStdout?: (data: Buffer) => void;
			onStderr?: (data: Buffer) => void;
			signal?: AbortSignal;
			timeout?: number;
			env?: NodeJS.ProcessEnv;
		},
	) => Promise<{ exitCode: number | null }>;
}

/**
 * Create bash operations using pi's built-in local shell execution backend.
 *
 * This is useful for extensions that intercept user_bash and still want pi's
 * standard local shell behavior while wrapping or rewriting commands.
 */
export function createLocalBashOperations(): BashOperations {
	return {
		exec: (command, cwd, { onData, onStdout, onStderr, signal, timeout, env }) => {
			return new Promise((resolve, reject) => {
				const { shell, args } = getShellConfig();
				if (!existsSync(cwd)) {
					reject(new Error(`Working directory does not exist: ${cwd}\nCannot execute bash commands.`));
					return;
				}
				const child = spawn(shell, [...args, command], {
					cwd,
					detached: true,
					env: env ?? getShellEnv(),
					stdio: ["ignore", "pipe", "pipe"],
				});
				let timedOut = false;
				let timeoutHandle: NodeJS.Timeout | undefined;
				// Set timeout if provided.
				if (timeout !== undefined && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) killProcessTree(child.pid);
					}, timeout * 1000);
				}
				// Stream stdout and stderr.
				child.stdout?.on("data", (data: Buffer) => {
					onData(data);
					onStdout?.(data);
				});
				child.stderr?.on("data", (data: Buffer) => {
					onData(data);
					onStderr?.(data);
				});
				// Handle abort signal by killing the entire process tree.
				const onAbort = () => {
					if (child.pid) killProcessTree(child.pid);
				};
				if (signal) {
					if (signal.aborted) onAbort();
					else signal.addEventListener("abort", onAbort, { once: true });
				}
				// Handle shell spawn errors and wait for the process to terminate without hanging
				// on inherited stdio handles held by detached descendants.
				waitForChildProcess(child)
					.then((code) => {
						if (timeoutHandle) clearTimeout(timeoutHandle);
						if (signal) signal.removeEventListener("abort", onAbort);
						if (signal?.aborted) {
							reject(new Error("aborted"));
							return;
						}
						if (timedOut) {
							reject(new Error(`timeout:${timeout}`));
							return;
						}
						resolve({ exitCode: code });
					})
					.catch((err) => {
						if (timeoutHandle) clearTimeout(timeoutHandle);
						if (signal) signal.removeEventListener("abort", onAbort);
						reject(err);
					});
			});
		},
	};
}

export interface BashSpawnContext {
	command: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export type BashSpawnHook = (context: BashSpawnContext) => BashSpawnContext;

function resolveSpawnContext(command: string, cwd: string, spawnHook?: BashSpawnHook): BashSpawnContext {
	const baseContext: BashSpawnContext = { command, cwd, env: { ...getShellEnv() } };
	return spawnHook ? spawnHook(baseContext) : baseContext;
}

export interface BashToolOptions {
	/** Custom operations for command execution. Default: local shell */
	operations?: BashOperations;
	/** Per-session artifact store for full stdout/stderr sidecar files. */
	artifactStore?: ArtifactStore;
	/** Output truncation/artifact thresholds. */
	toolOutputs?: ToolOutputSettings;
	/** Command prefix prepended to every command (for example shell setup commands) */
	commandPrefix?: string;
	/** Hook to adjust command, cwd, or env before execution */
	spawnHook?: BashSpawnHook;
}

const BASH_PREVIEW_LINES = 5;

function getMaxStdoutLines(settings?: ToolOutputSettings): number {
	return getStdoutPrefixLines(settings) + getStdoutSuffixLines(settings);
}

function getStdoutPrefixLines(settings?: ToolOutputSettings): number {
	return settings?.maxStdoutPrefixLines ?? DEFAULT_STDOUT_PREFIX_LINES;
}

function getStdoutSuffixLines(settings?: ToolOutputSettings): number {
	return settings?.maxStdoutSuffixLines ?? DEFAULT_STDOUT_SUFFIX_LINES;
}

function formatArtifactNotice(kind: "stdout" | "stderr", artifactPath: string, truncation: TruncationResult): string {
	return `[Full ${kind} saved to artifact file: ${artifactPath}; showing ${truncation.outputLines} of ${truncation.totalLines} lines]`;
}

class HeadTailLineTracker {
	private readonly head: string[] = [];
	private readonly tail: string[] = [];
	private pending = "";
	private sawAnyText = false;
	private endedWithNewline = false;
	private totalLines = 0;

	constructor(
		private readonly prefixLines: number,
		private readonly suffixLines: number,
	) {}

	push(text: string): void {
		if (!text) return;
		this.sawAnyText = true;
		this.endedWithNewline = text.endsWith("\n");
		const combined = this.pending + text;
		const parts = combined.split("\n");
		this.pending = parts.pop() ?? "";
		for (const line of parts) this.recordLine(line);
	}

	finish(finalChunk = ""): TruncationResult {
		this.push(finalChunk);
		if (this.pending.length > 0 || (this.sawAnyText && this.endedWithNewline)) {
			this.recordLine(this.pending);
			this.pending = "";
			this.endedWithNewline = false;
		}
		const totalBytes = Buffer.byteLength(this.renderFullContent(), "utf-8");
		if (this.totalLines <= this.prefixLines + this.suffixLines) {
			const content = [...this.head, ...this.tail].join("\n");
			return {
				content,
				truncated: false,
				truncatedBy: null,
				totalLines: this.totalLines,
				totalBytes,
				outputLines: this.totalLines,
				outputBytes: Buffer.byteLength(content, "utf-8"),
				lastLinePartial: false,
				firstLineExceedsLimit: false,
				maxLines: this.prefixLines + this.suffixLines,
				maxBytes: DEFAULT_MAX_BYTES,
			};
		}
		const omittedLines = this.totalLines - this.head.length - this.tail.length;
		const content = [...this.head, `[... ${omittedLines} lines omitted ...]`, ...this.tail].join("\n");
		return {
			content,
			truncated: true,
			truncatedBy: "lines",
			totalLines: this.totalLines,
			totalBytes,
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
		if (this.suffixLines === 0) return;
		this.tail.push(line);
		if (this.tail.length > this.suffixLines) this.tail.shift();
	}

	private renderFullContent(): string {
		if (this.totalLines <= this.prefixLines) return this.head.join("\n");
		return [...this.head, ...this.tail].join("\n");
	}
}

type BashRenderState = {
	startedAt: number | undefined;
	endedAt: number | undefined;
	interval: NodeJS.Timeout | undefined;
};

type BashResultRenderState = {
	cachedWidth: number | undefined;
	cachedLines: string[] | undefined;
	cachedSkipped: number | undefined;
};

class BashResultRenderComponent extends Container {
	state: BashResultRenderState = {
		cachedWidth: undefined,
		cachedLines: undefined,
		cachedSkipped: undefined,
	};
}

function formatDuration(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatBashCall(args: { command?: string; timeout?: number } | undefined): string {
	const command = str(args?.command);
	const timeout = args?.timeout as number | undefined;
	const timeoutSuffix = timeout ? theme.fg("muted", ` (timeout ${timeout}s)`) : "";
	const commandDisplay = command === null ? invalidArgText(theme) : command ? command : theme.fg("toolOutput", "...");
	return theme.fg("toolTitle", theme.bold(`$ ${commandDisplay}`)) + timeoutSuffix;
}

function rebuildBashResultRenderComponent(
	component: BashResultRenderComponent,
	result: {
		content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		details?: BashToolDetails;
	},
	options: ToolRenderResultOptions,
	showImages: boolean,
	startedAt: number | undefined,
	endedAt: number | undefined,
): void {
	const state = component.state;
	component.clear();

	const output = getTextOutput(result as any, showImages).trim();

	if (output) {
		const styledOutput = output
			.split("\n")
			.map((line) => theme.fg("toolOutput", line))
			.join("\n");

		if (options.expanded) {
			component.addChild(new Text(`\n${styledOutput}`, 0, 0));
		} else {
			component.addChild({
				render: (width: number) => {
					if (state.cachedLines === undefined || state.cachedWidth !== width) {
						const preview = truncateToVisualLines(styledOutput, BASH_PREVIEW_LINES, width);
						state.cachedLines = preview.visualLines;
						state.cachedSkipped = preview.skippedCount;
						state.cachedWidth = width;
					}
					if (state.cachedSkipped && state.cachedSkipped > 0) {
						const hint =
							theme.fg("muted", `... (${state.cachedSkipped} earlier lines,`) +
							` ${keyHint("app.tools.expand", "to expand")})`;
						return ["", truncateToWidth(hint, width, "..."), ...(state.cachedLines ?? [])];
					}
					return ["", ...(state.cachedLines ?? [])];
				},
				invalidate: () => {
					state.cachedWidth = undefined;
					state.cachedLines = undefined;
					state.cachedSkipped = undefined;
				},
			});
		}
	}

	const truncation = result.details?.truncation;
	const fullOutputPath = result.details?.fullOutputPath;
	if (truncation?.truncated || fullOutputPath) {
		const warnings: string[] = [];
		if (fullOutputPath) {
			warnings.push(`Full output: ${formatVisiblePath(fullOutputPath)}`);
		}
		if (truncation?.truncated) {
			if (truncation.truncatedBy === "lines") {
				warnings.push(`Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`);
			} else {
				warnings.push(
					`Truncated: ${truncation.outputLines} lines shown (${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit)`,
				);
			}
		}
		component.addChild(new Text(`\n${theme.fg("warning", `[${warnings.join(". ")}]`)}`, 0, 0));
	}

	if (startedAt !== undefined) {
		const label = options.isPartial ? "Elapsed" : "Took";
		const endTime = endedAt ?? Date.now();
		component.addChild(new Text(`\n${theme.fg("muted", `${label} ${formatDuration(endTime - startedAt)}`)}`, 0, 0));
	}
}

export function createBashToolDefinition(
	cwd: string,
	options?: BashToolOptions,
): ToolDefinition<typeof bashSchema, BashToolDetails | undefined, BashRenderState> {
	const ops = options?.operations ?? createLocalBashOperations();
	const artifactStore = options?.artifactStore;
	const toolOutputs = options?.toolOutputs;
	const commandPrefix = options?.commandPrefix;
	const spawnHook = options?.spawnHook;
	return {
		name: "bash",
		label: "bash",
		description: `Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds.`,
		promptSnippet: "Execute bash commands (ls, grep, find, etc.)",
		promptGuidelines: [
			"Use specialized tools (read/edit/write/fs_search) instead of bash for file operations. Reserve bash for actual system/terminal commands.",
		],
		parameters: bashSchema,
		async execute(
			toolCallId,
			{ command, timeout }: { command: string; timeout?: number },
			signal?: AbortSignal,
			onUpdate?,
			_ctx?,
		) {
			const resolvedCommand = commandPrefix ? `${commandPrefix}\n${command}` : command;
			const spawnContext = resolveSpawnContext(resolvedCommand, cwd, spawnHook);
			if (onUpdate) {
				onUpdate({ content: [], details: undefined });
			}
			return new Promise((resolve, reject) => {
				let tempFilePath: string | undefined;
				let tempFileStream: ReturnType<typeof createWriteStream> | undefined;
				let totalBytes = 0;
				const combinedDecoder = new StringDecoder("utf8");
				const combinedTracker = new HeadTailLineTracker(
					getStdoutPrefixLines(toolOutputs),
					getStdoutSuffixLines(toolOutputs),
				);
				const chunks: Buffer[] = [];
				const stdoutChunks: Buffer[] = [];
				const stderrChunks: Buffer[] = [];
				let chunksBytes = 0;
				const maxChunksBytes = DEFAULT_MAX_BYTES * 2;

				const ensureTempFile = () => {
					if (tempFilePath) return;
					tempFilePath = getTempFilePath();
					tempFileStream = createWriteStream(tempFilePath);
					for (const chunk of chunks) tempFileStream.write(chunk);
				};

				const handleData = (data: Buffer) => {
					totalBytes += data.length;
					combinedTracker.push(combinedDecoder.write(data));
					// Start writing to a temp file once output exceeds the in-memory threshold.
					if (totalBytes > DEFAULT_MAX_BYTES) {
						ensureTempFile();
					}
					// Write to temp file if we have one.
					if (tempFileStream) tempFileStream.write(data);
					// Keep a rolling buffer of recent output for tail truncation.
					chunks.push(data);
					chunksBytes += data.length;
					// Trim old chunks if the rolling buffer grows too large.
					while (chunksBytes > maxChunksBytes && chunks.length > 1) {
						const removed = chunks.shift()!;
						chunksBytes -= removed.length;
					}
					// Stream partial output using the rolling tail buffer.
					if (onUpdate) {
						const fullBuffer = Buffer.concat(chunks);
						const fullText = fullBuffer.toString("utf-8");
						const truncation = truncateTail(fullText, { maxLines: getMaxStdoutLines(toolOutputs) });
						if (truncation.truncated) {
							ensureTempFile();
						}
						onUpdate({
							content: [{ type: "text", text: truncation.content || "" }],
							details: {
								truncation: truncation.truncated ? truncation : undefined,
								fullOutputPath: tempFilePath,
							},
						});
					}
				};
				const handleStdout = (data: Buffer) => stdoutChunks.push(data);
				const handleStderr = (data: Buffer) => stderrChunks.push(data);

				ops.exec(spawnContext.command, spawnContext.cwd, {
					onData: handleData,
					onStdout: handleStdout,
					onStderr: handleStderr,
					signal,
					timeout,
					env: spawnContext.env,
				})
					.then(({ exitCode }) => {
						// Finish the prefix+suffix tracker for final display.
						const truncation = combinedTracker.finish(combinedDecoder.end());
						truncation.totalBytes = totalBytes;
						if (truncation.truncated) {
							ensureTempFile();
						}
						const stdoutText = Buffer.concat(stdoutChunks).toString("utf-8");
						const stderrText = Buffer.concat(stderrChunks).toString("utf-8");
						const stdoutTruncation = truncateTail(stdoutText, { maxLines: getMaxStdoutLines(toolOutputs) });
						const stderrTruncation = truncateTail(stderrText, { maxLines: getMaxStdoutLines(toolOutputs) });
						const stdoutArtifactPath =
							stdoutText && stdoutTruncation.truncated && artifactStore
								? artifactStore.writeArtifact("stdout", toolCallId, stdoutText)
								: undefined;
						const stderrArtifactPath =
							stderrText && stderrTruncation.truncated && artifactStore
								? artifactStore.writeArtifact("stderr", toolCallId, stderrText)
								: undefined;
						// Close temp file stream before building the final result.
						if (tempFileStream) tempFileStream.end();
						let outputText = truncation.content || "(no output)";
						let details: BashToolDetails | undefined;
						if (truncation.truncated || stdoutArtifactPath || stderrArtifactPath) {
							// Build truncation details and an actionable notice.
							details = {
								truncation: truncation.truncated ? truncation : undefined,
								fullOutputPath: tempFilePath,
								stdoutArtifactPath,
								stderrArtifactPath,
							};
							if (stdoutArtifactPath) {
								outputText += `\n\n${formatArtifactNotice(
									"stdout",
									artifactStore?.getVisiblePath(stdoutArtifactPath, cwd) ?? stdoutArtifactPath,
									stdoutTruncation,
								)}`;
							}
							if (stderrArtifactPath) {
								outputText += `\n\n${formatArtifactNotice(
									"stderr",
									artifactStore?.getVisiblePath(stderrArtifactPath, cwd) ?? stderrArtifactPath,
									stderrTruncation,
								)}`;
							}
						}
						if (truncation.truncated) {
							const visibleFullOutputPath = tempFilePath
								? (artifactStore?.getVisiblePath(tempFilePath, cwd) ?? formatVisiblePath(tempFilePath))
								: "artifact.txt";
							const omittedLines = Math.max(
								0,
								truncation.totalLines - getStdoutPrefixLines(toolOutputs) - getStdoutSuffixLines(toolOutputs),
							);
							outputText += `\n\n[Showing first ${getStdoutPrefixLines(toolOutputs)} and last ${getStdoutSuffixLines(toolOutputs)} lines of ${truncation.totalLines}; omitted ${omittedLines} middle lines. Full output saved to artifact file: ${visibleFullOutputPath}]`;
						}
						if (exitCode !== 0 && exitCode !== null) {
							outputText += `\n\nCommand exited with code ${exitCode}`;
							reject(new Error(outputText));
						} else {
							resolve({ content: [{ type: "text", text: outputText }], details });
						}
					})
					.catch((err: Error) => {
						// Close temp file stream and include buffered output in the error message.
						if (tempFileStream) tempFileStream.end();
						const fullBuffer = Buffer.concat(chunks);
						let output = fullBuffer.toString("utf-8");
						if (err.message === "aborted") {
							if (output) output += "\n\n";
							output += "Command aborted";
							reject(new Error(output));
						} else if (err.message.startsWith("timeout:")) {
							const timeoutSecs = err.message.split(":")[1];
							if (output) output += "\n\n";
							output += `Command timed out after ${timeoutSecs} seconds`;
							reject(new Error(output));
						} else {
							reject(err);
						}
					});
			});
		},
		renderCall(args, _theme, context) {
			const state = context.state;
			if (context.executionStarted && state.startedAt === undefined) {
				state.startedAt = Date.now();
				state.endedAt = undefined;
			}
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatBashCall(args));
			return text;
		},
		renderResult(result, options, _theme, context) {
			const state = context.state;
			if (state.startedAt !== undefined && options.isPartial && !state.interval) {
				state.interval = setInterval(() => context.invalidate(), 1000);
			}
			if (!options.isPartial || context.isError) {
				state.endedAt ??= Date.now();
				if (state.interval) {
					clearInterval(state.interval);
					state.interval = undefined;
				}
			}
			const component =
				(context.lastComponent as BashResultRenderComponent | undefined) ?? new BashResultRenderComponent();
			rebuildBashResultRenderComponent(
				component,
				result as any,
				options,
				context.showImages,
				state.startedAt,
				state.endedAt,
			);
			component.invalidate();
			return component;
		},
	};
}

export function createBashTool(cwd: string, options?: BashToolOptions): AgentTool<typeof bashSchema> {
	return wrapToolDefinition(createBashToolDefinition(cwd, options));
}

/** Default bash tool using process.cwd() for backwards compatibility. */
export const bashToolDefinition = createBashToolDefinition(process.cwd());
export const bashTool = createBashTool(process.cwd());
