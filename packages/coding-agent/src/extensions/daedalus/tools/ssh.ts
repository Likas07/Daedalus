import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import {
	createBashTool,
	createFetchTool,
	createFindTool,
	createGrepTool,
	createHashlineEditTool,
	createLsTool,
	createReadTool,
	createWriteTool,
	DEFAULT_MAX_BYTES,
	formatSize,
	type GrepToolDetails,
	truncateHead,
	truncateLine,
} from "@daedalus-pi/coding-agent";
import { resolveToCwd } from "../../../core/tools/path-utils.js";
import { GREP_MAX_LINE_LENGTH } from "../../../core/tools/truncate.js";
import {
	buildShellCommand,
	createRemoteBashOps,
	createRemoteFetchOperations,
	createRemoteFindOps,
	createRemoteHashlineEditOps,
	createRemoteLsOps,
	createRemoteReadOps,
	createRemoteWriteOps,
	getRemotePathInfo,
	parseSshArg,
	type SshConfig,
	sshExec,
	toLocalPath,
	toRemotePath,
	toSshBashCommand,
} from "../shared/ssh.js";

const DEFAULT_GREP_LIMIT = 100;

function normalizeRemoteMatchPath(rawPath: string, searchPath: string, localCwd: string, ssh: SshConfig): string {
	if (rawPath.startsWith("/")) return toLocalPath(localCwd, ssh.remoteCwd, rawPath);
	return path.resolve(searchPath, rawPath.split("/").join(path.sep));
}

async function executeRemoteGrep(
	localCwd: string,
	ssh: SshConfig,
	params: {
		pattern: string;
		path?: string;
		glob?: string;
		ignoreCase?: boolean;
		literal?: boolean;
		context?: number;
		limit?: number;
	},
	signal?: AbortSignal,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: GrepToolDetails | undefined }> {
	const { pattern, path: searchDir, glob, ignoreCase, literal, context, limit } = params;
	const searchPath = resolveToCwd(searchDir || ".", localCwd);
	const remoteSearchPath = toRemotePath(localCwd, ssh.remoteCwd, searchPath);
	const searchInfo = await getRemotePathInfo(ssh.remote, remoteSearchPath);
	if (!searchInfo.exists) throw new Error(`Path not found: ${searchPath}`);

	const isDirectory = searchInfo.isDirectory;
	const contextValue = context && context > 0 ? context : 0;
	const effectiveLimit = Math.max(1, limit ?? DEFAULT_GREP_LIMIT);
	const readOps = createRemoteReadOps(ssh.remote, ssh.remoteCwd, localCwd);
	const fileCache = new Map<string, string[]>();

	const formatPath = (filePath: string): string => {
		if (isDirectory) {
			const relative = path.relative(searchPath, filePath);
			if (relative && !relative.startsWith("..")) return relative.replace(/\\/g, "/");
		}
		return path.basename(filePath);
	};

	const getFileLines = async (filePath: string): Promise<string[]> => {
		let lines = fileCache.get(filePath);
		if (!lines) {
			try {
				const content = (await readOps.readFile(filePath)).toString("utf-8");
				lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
			} catch {
				lines = [];
			}
			fileCache.set(filePath, lines);
		}
		return lines;
	};

	const args: string[] = ["rg", "--json", "--line-number", "--color=never", "--hidden"];
	if (ignoreCase) args.push("--ignore-case");
	if (literal) args.push("--fixed-strings");
	if (glob) args.push("--glob", glob);
	args.push(pattern, remoteSearchPath);

	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}

		let settled = false;
		const settle = (fn: () => void) => {
			if (!settled) {
				settled = true;
				fn();
			}
		};

		const child = spawn("ssh", [ssh.remote, toSshBashCommand(buildShellCommand(args))], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		const rl = createInterface({ input: child.stdout });
		let stderr = "";
		let matchCount = 0;
		let matchLimitReached = false;
		let linesTruncated = false;
		let aborted = false;
		let killedDueToLimit = false;
		const outputLines: string[] = [];
		const matches: Array<{ filePath: string; lineNumber: number }> = [];

		const cleanup = () => {
			rl.close();
			signal?.removeEventListener("abort", onAbort);
		};
		const stopChild = (dueToLimit = false) => {
			if (!child.killed) {
				killedDueToLimit = dueToLimit;
				child.kill();
			}
		};
		const onAbort = () => {
			aborted = true;
			stopChild();
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		const formatBlock = async (filePath: string, lineNumber: number): Promise<string[]> => {
			const relativePath = formatPath(filePath);
			const lines = await getFileLines(filePath);
			if (!lines.length) return [`${relativePath}:${lineNumber}: (unable to read file)`];
			const block: string[] = [];
			const start = contextValue > 0 ? Math.max(1, lineNumber - contextValue) : lineNumber;
			const end = contextValue > 0 ? Math.min(lines.length, lineNumber + contextValue) : lineNumber;
			for (let current = start; current <= end; current++) {
				const lineText = lines[current - 1] ?? "";
				const sanitized = lineText.replace(/\r/g, "");
				const isMatchLine = current === lineNumber;
				const { text: truncatedText, wasTruncated } = truncateLine(sanitized);
				if (wasTruncated) linesTruncated = true;
				if (isMatchLine) block.push(`${relativePath}:${current}: ${truncatedText}`);
				else block.push(`${relativePath}-${current}- ${truncatedText}`);
			}
			return block;
		};

		rl.on("line", (line) => {
			if (!line.trim() || matchCount >= effectiveLimit) return;
			let event: any;
			try {
				event = JSON.parse(line);
			} catch {
				return;
			}
			if (event.type === "match") {
				matchCount++;
				const rawPath = event.data?.path?.text;
				const lineNumber = event.data?.line_number;
				if (typeof rawPath === "string" && typeof lineNumber === "number") {
					matches.push({
						filePath: normalizeRemoteMatchPath(rawPath, searchPath, localCwd, ssh),
						lineNumber,
					});
				}
				if (matchCount >= effectiveLimit) {
					matchLimitReached = true;
					stopChild(true);
				}
			}
		});

		child.on("error", (error) => {
			cleanup();
			settle(() => reject(new Error(`Failed to run ripgrep over SSH: ${error.message}`)));
		});
		child.on("close", async (code) => {
			cleanup();
			if (aborted) {
				settle(() => reject(new Error("Operation aborted")));
				return;
			}
			if (!killedDueToLimit && code !== 0 && code !== 1) {
				const errorMsg = stderr.trim() || `ripgrep exited with code ${code}`;
				settle(() => reject(new Error(errorMsg)));
				return;
			}
			if (matchCount === 0) {
				settle(() => resolve({ content: [{ type: "text", text: "No matches found" }], details: undefined }));
				return;
			}

			for (const match of matches) {
				const block = await formatBlock(match.filePath, match.lineNumber);
				outputLines.push(...block);
			}

			const rawOutput = outputLines.join("\n");
			const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
			let output = truncation.content;
			const details: GrepToolDetails = {};
			const notices: string[] = [];
			if (matchLimitReached) {
				notices.push(
					`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
				);
				details.matchLimitReached = effectiveLimit;
			}
			if (truncation.truncated) {
				notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
				details.truncation = truncation;
			}
			if (linesTruncated) {
				notices.push(`Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`);
				details.linesTruncated = true;
			}
			if (notices.length > 0) output += `\n\n[${notices.join(". ")}]`;
			settle(() =>
				resolve({
					content: [{ type: "text", text: output }],
					details: Object.keys(details).length > 0 ? details : undefined,
				}),
			);
		});
	});
}

async function resolveSshConfig(arg: string): Promise<SshConfig> {
	const parsed = parseSshArg(arg);
	if (parsed.path) {
		const remoteCwd = parsed.path;
		const info = await getRemotePathInfo(parsed.remote, remoteCwd);
		if (!info.exists) {
			throw new Error(`SSH remote path does not exist: ${parsed.remote}:${remoteCwd}`);
		}
		if (!info.isDirectory) {
			throw new Error(`SSH remote path is not a directory: ${parsed.remote}:${remoteCwd}`);
		}
		return { remote: parsed.remote, remoteCwd };
	}

	const pwd = (await sshExec(parsed.remote, "pwd")).toString().trim();
	const info = await getRemotePathInfo(parsed.remote, pwd);
	if (!info.exists || !info.isDirectory) {
		throw new Error(`SSH remote cwd is invalid: ${parsed.remote}:${pwd}`);
	}
	return { remote: parsed.remote, remoteCwd: pwd };
}

export default function (pi: ExtensionAPI) {
	pi.registerFlag("ssh", { description: "SSH remote: user@host or user@host:/path", type: "string" });

	const localCwd = process.cwd();
	const localRead = createReadTool(localCwd);
	const localWrite = createWriteTool(localCwd);
	const localHashlineEdit = createHashlineEditTool(localCwd);
	const localBash = createBashTool(localCwd);
	const localLs = createLsTool(localCwd);
	const localFetch = createFetchTool(localCwd);
	const localFind = createFindTool(localCwd);
	const localGrep = createGrepTool(localCwd);

	let resolvedSsh: SshConfig | null = null;

	const getSsh = () => resolvedSsh;

	pi.registerTool({
		...localRead,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createReadTool(localCwd, {
					operations: createRemoteReadOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localRead.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localWrite,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createWriteTool(localCwd, {
					operations: createRemoteWriteOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localWrite.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localHashlineEdit,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createHashlineEditTool(localCwd, {
					operations: createRemoteHashlineEditOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localHashlineEdit.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localBash,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createBashTool(localCwd, {
					operations: createRemoteBashOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localBash.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localLs,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createLsTool(localCwd, {
					operations: createRemoteLsOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localLs.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localFetch,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createFetchTool(localCwd, {
					operations: createRemoteFetchOperations(ssh.remote),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localFetch.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localFind,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createFindTool(localCwd, {
					operations: createRemoteFindOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localFind.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localGrep,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) return executeRemoteGrep(localCwd, ssh, params, signal);
			return localGrep.execute(id, params, signal, onUpdate);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const arg = pi.getFlag("ssh") as string | undefined;
		if (arg) {
			resolvedSsh = await resolveSshConfig(arg);
			ctx.ui.setStatus("ssh", ctx.ui.theme.fg("accent", `SSH: ${resolvedSsh.remote}:${resolvedSsh.remoteCwd}`));
			ctx.ui.notify(`SSH mode: ${resolvedSsh.remote}:${resolvedSsh.remoteCwd}`, "info");
		}
	});

	pi.on("user_bash", (_event) => {
		const ssh = getSsh();
		if (!ssh) return;
		return { operations: createRemoteBashOps(ssh.remote, ssh.remoteCwd, localCwd) };
	});

	pi.on("before_agent_start", async (event) => {
		const ssh = getSsh();
		if (ssh) {
			const modified = event.systemPrompt.replace(
				`Current working directory: ${localCwd}`,
				`Current working directory: ${ssh.remoteCwd} (via SSH: ${ssh.remote})`,
			);
			return { systemPrompt: modified };
		}
	});
}
