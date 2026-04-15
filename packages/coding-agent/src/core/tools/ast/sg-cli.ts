import { spawn } from "child_process";
import { ensureTool } from "../../../utils/tools-manager.js";
import type { AstBackend, AstBackendRequest, AstBackendResult, AstMatch } from "./types.js";

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

export function createSgCliBackend(): AstBackend {
	return {
		async run(request: AstBackendRequest): Promise<AstBackendResult> {
			const astGrepPath = await ensureTool("ast_grep", true);
			if (!astGrepPath) {
				throw new Error("ast-grep is not available and could not be downloaded");
			}
			const args = ["run", "--json=stream", "--color=never", "--pattern", request.pattern];
			if (request.rewrite !== undefined) args.push("--rewrite", request.rewrite);
			if (request.lang?.trim()) args.push("--lang", request.lang.trim());
			if (request.selector?.trim()) args.push("--selector", request.selector.trim());
			if (request.glob?.trim()) args.push("--globs", request.glob.trim());
			args.push(...request.paths);

			return new Promise<AstBackendResult>((resolve, reject) => {
				if (request.signal?.aborted) {
					reject(new Error("Operation aborted"));
					return;
				}
				let stdout = "";
				let stderr = "";
				const child = spawn(astGrepPath, args, {
					cwd: request.cwd,
					stdio: ["ignore", "pipe", "pipe"],
				});
				const onAbort = () => child.kill();
				request.signal?.addEventListener("abort", onAbort, { once: true });
				child.stdout.on("data", (chunk) => {
					stdout += chunk.toString();
				});
				child.stderr.on("data", (chunk) => {
					stderr += chunk.toString();
				});
				child.on("error", (error) => {
					request.signal?.removeEventListener("abort", onAbort);
					reject(error);
				});
				child.on("close", (code) => {
					request.signal?.removeEventListener("abort", onAbort);
					if (request.signal?.aborted) {
						reject(new Error("Operation aborted"));
						return;
					}
					if (code !== 0 && stdout.trim().length === 0) {
						reject(new Error(stderr.trim() || `ast-grep exited with code ${code}`));
						return;
					}
					try {
						resolve({ matches: collectJsonObjects(stdout), stderr: stderr.trim() });
					} catch (error) {
						reject(error instanceof Error ? error : new Error(String(error)));
					}
				});
			});
		},
	};
}
