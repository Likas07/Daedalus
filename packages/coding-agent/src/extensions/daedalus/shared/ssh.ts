import { spawn } from "node:child_process";
import nodePath from "node:path";
import type {
	BashOperations,
	EditOperations,
	FindOperations,
	HashlineEditOperations,
	LsOperations,
	ReadOperations,
	WriteOperations,
} from "@daedalus-pi/coding-agent";
import type { AstBackend, AstBackendRequest, AstBackendResult, AstMatch } from "../../../core/tools/ast/types.js";
import type { FetchOperations } from "../../../core/tools/fetch/types.js";

export interface SshConfig {
	remote: string;
	remoteCwd: string;
}

export interface SshExecOptions {
	signal?: AbortSignal;
	onStdout?: (chunk: Buffer) => void;
	onStderr?: (chunk: Buffer) => void;
	stdin?: string | Buffer;
}

export interface SshExecResult {
	stdout: Buffer;
	stderr: Buffer;
	exitCode: number;
}

export interface RemotePathInfo {
	exists: boolean;
	isDirectory: boolean;
}

export function parseSshArg(arg: string): { remote: string; path?: string } {
	const separatorIndex = arg.indexOf(":");
	if (separatorIndex !== -1) {
		const remote = arg.slice(0, separatorIndex);
		const path = arg.slice(separatorIndex + 1);
		return { remote, path };
	}

	return { remote: arg };
}

/**
 * POSIX shell quoting for a single argument.
 * Keep this as real shell escaping, not JSON escaping.
 */
export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildShellCommand(args: string[]): string {
	return args.map(shellQuote).join(" ");
}

export function toSshBashCommand(script: string): string {
	return `bash -lc ${shellQuote(script)}`;
}

function combineSshBashOptions(script: string, options?: SshExecOptions): SshExecOptions {
	if (options?.stdin !== undefined) {
		throw new Error("sshBash does not support custom stdin because the script itself is sent over stdin");
	}
	return { ...options, stdin: script };
}

export function sshExecDetailed(remote: string, command: string, options?: SshExecOptions): Promise<SshExecResult> {
	return new Promise((resolve, reject) => {
		if (options?.signal?.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}

		const child = spawn("ssh", [remote, command], { stdio: ["pipe", "pipe", "pipe"] });
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let settled = false;
		let stdinError: Error | undefined;

		const cleanup = () => {
			options?.signal?.removeEventListener("abort", onAbort);
			child.stdin?.removeListener("error", onStdinError);
		};
		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			fn();
		};
		const onAbort = () => child.kill();
		const onStdinError = (error: Error) => {
			stdinError = error;
		};
		options?.signal?.addEventListener("abort", onAbort, { once: true });

		child.stdout.on("data", (data: Buffer) => {
			stdoutChunks.push(data);
			options?.onStdout?.(data);
		});
		child.stderr.on("data", (data: Buffer) => {
			stderrChunks.push(data);
			options?.onStderr?.(data);
		});
		child.stdin?.on("error", onStdinError);
		child.on("error", (error) => {
			settle(() => reject(error));
		});
		child.on("close", (code) => {
			settle(() => {
				if (options?.signal?.aborted) {
					reject(new Error("Operation aborted"));
					return;
				}
				if ((code ?? -1) === 0 && stdinError) {
					reject(stdinError);
					return;
				}
				resolve({
					stdout: Buffer.concat(stdoutChunks),
					stderr: Buffer.concat(stderrChunks),
					exitCode: code ?? -1,
				});
			});
		});

		try {
			if (options?.stdin !== undefined) {
				child.stdin?.end(options.stdin);
			} else {
				child.stdin?.end();
			}
		} catch (error) {
			settle(() => reject(error instanceof Error ? error : new Error(String(error))));
		}
	});
}

export async function sshExec(remote: string, command: string, options?: SshExecOptions): Promise<Buffer> {
	const result = await sshExecDetailed(remote, command, options);
	if (result.exitCode !== 0) {
		throw new Error(`SSH failed (${result.exitCode}): ${result.stderr.toString()}`);
	}
	return result.stdout;
}

export async function sshExecText(remote: string, command: string, options?: SshExecOptions): Promise<string> {
	return (await sshExec(remote, command, options)).toString();
}

export async function sshBash(remote: string, script: string, options?: SshExecOptions): Promise<Buffer> {
	return sshExec(remote, "bash -se", combineSshBashOptions(script, options));
}

export async function sshBashText(remote: string, script: string, options?: SshExecOptions): Promise<string> {
	return sshExecText(remote, "bash -se", combineSshBashOptions(script, options));
}

function isSubpath(root: string, value: string): boolean {
	const relative = nodePath.relative(root, value);
	return relative === "" || (!relative.startsWith("..") && !nodePath.isAbsolute(relative));
}

function toPosixPath(value: string): string {
	return value.split(nodePath.sep).join("/");
}

async function readRemoteFile(remote: string, remotePath: string): Promise<Buffer> {
	return sshExec(remote, buildShellCommand(["cat", remotePath]));
}

async function verifyRemoteWrite(
	remote: string,
	remotePath: string,
	expected: Buffer,
	displayPath: string,
): Promise<void> {
	const actual = await readRemoteFile(remote, remotePath);
	if (!actual.equals(expected)) {
		throw new Error(
			`Remote write verification failed for ${displayPath}: expected ${expected.length} bytes, got ${actual.length}`,
		);
	}
}

export function toRemotePath(localCwd: string, remoteCwd: string, inputPath: string): string {
	if (!nodePath.isAbsolute(inputPath)) {
		return nodePath.posix.join(remoteCwd, toPosixPath(inputPath));
	}
	if (isSubpath(localCwd, inputPath)) {
		const relative = nodePath.relative(localCwd, inputPath);
		return relative.length === 0 ? remoteCwd : nodePath.posix.join(remoteCwd, toPosixPath(relative));
	}
	return toPosixPath(inputPath);
}

export function toLocalPath(localCwd: string, remoteCwd: string, inputPath: string): string {
	if (!nodePath.isAbsolute(inputPath)) {
		return nodePath.resolve(localCwd, inputPath.split("/").join(nodePath.sep));
	}
	if (inputPath === remoteCwd || inputPath.startsWith(`${remoteCwd}/`)) {
		const relative = inputPath === remoteCwd ? "" : inputPath.slice(remoteCwd.length + 1);
		return relative.length === 0 ? localCwd : nodePath.join(localCwd, relative.split("/").join(nodePath.sep));
	}
	return inputPath.split("/").join(nodePath.sep);
}

export async function getRemotePathInfo(remote: string, remotePath: string): Promise<RemotePathInfo> {
	const output = await sshBashText(
		remote,
		`if [ -d ${shellQuote(remotePath)} ]; then printf 'directory'; elif [ -e ${shellQuote(remotePath)} ]; then printf 'file'; else printf 'missing'; fi`,
	);
	const normalized = output.trim();
	return {
		exists: normalized !== "missing",
		isDirectory: normalized === "directory",
	};
}

export function createRemoteReadOps(remote: string, remoteCwd: string, localCwd: string): ReadOperations {
	const remap = (p: string) => toRemotePath(localCwd, remoteCwd, p);
	return {
		readFile: (p) => readRemoteFile(remote, remap(p)),
		access: async (p) => {
			const info = await getRemotePathInfo(remote, remap(p));
			if (!info.exists) throw new Error(`Path not found: ${p}`);
		},
		detectImageMimeType: async (p) => {
			try {
				const result = await sshExecText(remote, buildShellCommand(["file", "--mime-type", "-b", remap(p)]));
				const mimeType = result.toString().trim();
				return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType) ? mimeType : null;
			} catch {
				return null;
			}
		},
	};
}

export function createRemoteWriteOps(remote: string, remoteCwd: string, localCwd: string): WriteOperations {
	const remap = (p: string) => toRemotePath(localCwd, remoteCwd, p);
	return {
		writeFile: async (p, content) => {
			const remotePath = remap(p);
			const expected = Buffer.from(content, "utf-8");
			// Do not embed payload bytes in the remote command string; stream them via stdin and verify after write.
			await sshExec(remote, toSshBashCommand(`cat > ${shellQuote(remotePath)}`), {
				stdin: expected,
			});
			await verifyRemoteWrite(remote, remotePath, expected, p);
		},
		mkdir: (dir) => sshExec(remote, buildShellCommand(["mkdir", "-p", remap(dir)])).then(() => {}),
	};
}

export function createRemoteEditOps(remote: string, remoteCwd: string, localCwd: string): EditOperations {
	const readOps = createRemoteReadOps(remote, remoteCwd, localCwd);
	const writeOps = createRemoteWriteOps(remote, remoteCwd, localCwd);
	return { readFile: readOps.readFile, access: readOps.access, writeFile: writeOps.writeFile };
}

export function createRemoteHashlineEditOps(
	remote: string,
	remoteCwd: string,
	localCwd: string,
): HashlineEditOperations {
	const readOps = createRemoteReadOps(remote, remoteCwd, localCwd);
	const writeOps = createRemoteWriteOps(remote, remoteCwd, localCwd);
	return { readFile: readOps.readFile, access: readOps.access, writeFile: writeOps.writeFile };
}

export function createRemoteLsOps(remote: string, remoteCwd: string, localCwd: string): LsOperations {
	const remap = (p: string) => toRemotePath(localCwd, remoteCwd, p);
	const statCache = new Map<string, boolean>();

	const getStat = async (absolutePath: string): Promise<boolean> => {
		const cached = statCache.get(absolutePath);
		if (cached !== undefined) return cached;
		const info = await getRemotePathInfo(remote, remap(absolutePath));
		if (!info.exists) throw new Error(`Path not found: ${absolutePath}`);
		statCache.set(absolutePath, info.isDirectory);
		return info.isDirectory;
	};

	return {
		exists: async (absolutePath) => (await getRemotePathInfo(remote, remap(absolutePath))).exists,
		stat: async (absolutePath) => {
			const isDirectory = await getStat(absolutePath);
			return { isDirectory: () => isDirectory };
		},
		readdir: async (absolutePath) => {
			const output = await sshBashText(
				remote,
				`cd ${shellQuote(remap(absolutePath))} && find . -mindepth 1 -maxdepth 1 -printf '%P\t%y\n'`,
			);
			const entries: string[] = [];
			for (const line of output.split(/\r?\n/)) {
				if (!line) continue;
				const [name, type] = line.split("\t");
				if (!name) continue;
				entries.push(name);
				statCache.set(nodePath.join(absolutePath, name), type === "d");
			}
			return entries;
		},
	};
}

export function createRemoteFindOps(remote: string, remoteCwd: string, localCwd: string): FindOperations {
	const remap = (p: string) => toRemotePath(localCwd, remoteCwd, p);
	return {
		exists: async (absolutePath) => (await getRemotePathInfo(remote, remap(absolutePath))).exists,
		glob: async (pattern, cwd, options) => {
			const excludes: string[] = [];
			for (const ignore of options.ignore) {
				if (ignore === "**/node_modules/**") excludes.push("node_modules");
				if (ignore === "**/.git/**") excludes.push(".git");
			}
			const args = ["fd", "--glob", "--color=never", "--hidden", "--max-results", String(options.limit)];
			for (const exclude of excludes) args.push("--exclude", exclude);
			args.push(pattern, ".");
			const output = await sshBashText(remote, `cd ${shellQuote(remap(cwd))} && ${buildShellCommand(args)}`);
			return output
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => line.length > 0)
				.map((line) => nodePath.resolve(cwd, line.split("/").join(nodePath.sep)));
		},
	};
}

export function createRemoteFetchOperations(remote: string): FetchOperations {
	const remoteFetch: typeof fetch = Object.assign(
		async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
			const headers = new Headers(init?.headers ?? {});
			const marker = "__DAEDALUS_FETCH_META_f3f6c7e4__";
			const args = [
				"curl",
				"--silent",
				"--show-error",
				"--location",
				"--output",
				"-",
				"--write-out",
				`${marker}%{response_code}\t%{content_type}\t%{url_effective}`,
				"--url",
				url,
			];
			for (const [key, value] of headers.entries()) args.push("-H", `${key}: ${value}`);
			const result = await sshExecDetailed(remote, buildShellCommand(args), { signal: init?.signal ?? undefined });
			if (result.exitCode !== 0) {
				throw new Error(result.stderr.toString().trim() || `curl exited with code ${result.exitCode}`);
			}
			const payload = result.stdout.toString("utf-8");
			const markerIndex = payload.lastIndexOf(marker);
			if (markerIndex === -1) {
				throw new Error("Failed to parse remote fetch response");
			}
			const body = payload.slice(0, markerIndex);
			const [statusRaw, contentTypeRaw, urlRaw] = payload.slice(markerIndex + marker.length).split("\t");
			const status = Number.parseInt(statusRaw ?? "", 10);
			const contentType = contentTypeRaw?.trim() || "text/plain";
			const effectiveUrl = urlRaw?.trim() || url;
			const response = new Response(body, {
				status: Number.isFinite(status) && status > 0 ? status : 200,
				headers: { "content-type": contentType },
			});
			Object.defineProperty(response, "url", { value: effectiveUrl, configurable: true });
			return response as Response;
		},
		{ preconnect: globalThis.fetch.preconnect.bind(globalThis.fetch) },
	);

	return { fetch: remoteFetch };
}

function collectJsonObjects(stdout: string): AstMatch[] {
	const trimmed = stdout.trim();
	if (!trimmed) return [];
	if (trimmed.startsWith("[")) {
		return JSON.parse(trimmed) as AstMatch[];
	}
	return trimmed
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as AstMatch);
}

export function createRemoteAstBackend(remote: string, remoteCwd: string, localCwd: string): AstBackend {
	return {
		async run(request: AstBackendRequest): Promise<AstBackendResult> {
			const remoteRequestCwd = toRemotePath(localCwd, remoteCwd, request.cwd);
			const remotePaths = request.paths.map((entry) =>
				nodePath.isAbsolute(entry) ? toRemotePath(localCwd, remoteCwd, entry) : entry.split(nodePath.sep).join("/"),
			);
			const args = ["ast-grep", "run", "--json=stream", "--color=never", "--pattern", request.pattern];
			if (request.rewrite !== undefined) args.push("--rewrite", request.rewrite);
			if (request.lang?.trim()) args.push("--lang", request.lang.trim());
			if (request.selector?.trim()) args.push("--selector", request.selector.trim());
			if (request.glob?.trim()) args.push("--globs", request.glob.trim());
			args.push(...remotePaths);
			const result = await sshExecDetailed(
				remote,
				toSshBashCommand(`cd ${shellQuote(remoteRequestCwd)} && ${buildShellCommand(args)}`),
				{
					signal: request.signal,
				},
			);
			const stdout = result.stdout.toString();
			const stderr = result.stderr.toString().trim();
			if (result.exitCode !== 0 && stdout.trim().length === 0) {
				throw new Error(stderr || `ast-grep exited with code ${result.exitCode}`);
			}
			const matches = collectJsonObjects(stdout).map((match) => ({
				...match,
				file: nodePath.isAbsolute(match.file)
					? toLocalPath(localCwd, remoteCwd, match.file)
					: nodePath.resolve(request.cwd, match.file.split("/").join(nodePath.sep)),
			}));
			return { matches, stderr };
		},
	};
}

export function createRemoteBashOps(remote: string, remoteCwd: string, localCwd: string): BashOperations {
	const remap = (p: string) => toRemotePath(localCwd, remoteCwd, p);
	return {
		exec: (command, cwd, { onData, signal, timeout }) =>
			new Promise((resolve, reject) => {
				const remoteCommand = toSshBashCommand(`cd ${shellQuote(remap(cwd))} && ${command}`);
				const child = spawn("ssh", [remote, remoteCommand], { stdio: ["ignore", "pipe", "pipe"] });
				let timedOut = false;
				const timer = timeout
					? setTimeout(() => {
							timedOut = true;
							child.kill();
						}, timeout * 1000)
					: undefined;

				child.stdout.on("data", onData);
				child.stderr.on("data", onData);
				child.on("error", (error) => {
					if (timer) clearTimeout(timer);
					reject(error);
				});

				const onAbort = () => child.kill();
				signal?.addEventListener("abort", onAbort, { once: true });
				child.on("close", (code) => {
					if (timer) clearTimeout(timer);
					signal?.removeEventListener("abort", onAbort);
					if (signal?.aborted) reject(new Error("aborted"));
					else if (timedOut) reject(new Error(`timeout:${timeout}`));
					else resolve({ exitCode: code });
				});
			}),
	};
}
