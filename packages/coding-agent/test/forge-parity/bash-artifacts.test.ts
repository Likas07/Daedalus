import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactStore } from "../../src/core/tools/artifact-store.js";
import { type BashOperations, createBashToolDefinition } from "../../src/core/tools/bash.js";

function text(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.map((c) => c.text ?? "").join("\n");
}

describe("bash long-output artifacts", () => {
	let agentDir: string;

	beforeEach(() => {
		agentDir = join(tmpdir(), `daedalus-bash-artifacts-${Date.now()}-${Math.random().toString(16).slice(2)}`);
	});

	afterEach(() => {
		rmSync(agentDir, { recursive: true, force: true });
	});

	it("saves full long stdout to a readable artifact and shows prefix+suffix lines with a sanitized note", async () => {
		const stdout = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join("\n");
		const operations: BashOperations = {
			exec: async (_command, _cwd, options) => {
				const data = Buffer.from(stdout);
				options.onData(data);
				options.onStdout?.(data);
				return { exitCode: 0 };
			},
		};
		const store = new ArtifactStore("session-a", agentDir);
		const tool = createBashToolDefinition(process.cwd(), {
			operations,
			artifactStore: store,
			toolOutputs: { maxStdoutPrefixLines: 3, maxStdoutSuffixLines: 2 },
		});

		const result = await tool.execute("call/1", { command: "long" }, undefined, undefined, {} as any);
		const artifactPath = result.details?.stdoutArtifactPath;
		expect(artifactPath).toBeDefined();
		expect(existsSync(artifactPath!)).toBe(true);
		expect(readFileSync(artifactPath!, "utf8")).toBe(stdout);
		expect(text(result)).toContain("line 1");
		expect(text(result)).toContain("line 2");
		expect(text(result)).toContain("line 3");
		expect(text(result)).toContain("[... 495 lines omitted ...]");
		expect(text(result)).toContain("line 499");
		expect(text(result)).toContain("line 500");
		expect(text(result)).not.toContain(artifactPath!);
		expect(text(result)).toContain("artifacts/session-a/call-1-stdout.txt");
		expect(text(result)).toContain("Full output saved to artifact file:");
	});

	it("saves full long stderr separately", async () => {
		const stderr = Array.from({ length: 50 }, (_, i) => `err ${i + 1}`).join("\n");
		const operations: BashOperations = {
			exec: async (_command, _cwd, options) => {
				const data = Buffer.from(stderr);
				options.onData(data);
				options.onStderr?.(data);
				return { exitCode: 0 };
			},
		};
		const store = new ArtifactStore("session-a", agentDir);
		const tool = createBashToolDefinition(process.cwd(), {
			operations,
			artifactStore: store,
			toolOutputs: { maxStdoutPrefixLines: 5, maxStdoutSuffixLines: 5 },
		});

		const result = await tool.execute("call-2", { command: "err" }, undefined, undefined, {} as any);
		const artifactPath = result.details?.stderrArtifactPath;
		expect(artifactPath).toBeDefined();
		expect(readFileSync(artifactPath!, "utf8")).toBe(stderr);
		expect(text(result)).not.toContain(artifactPath!);
		expect(text(result)).toContain("artifacts/session-a/call-2-stderr.txt");
	});

	it("does not create artifacts for short output", async () => {
		const operations: BashOperations = {
			exec: async (_command, _cwd, options) => {
				const data = Buffer.from("short\noutput");
				options.onData(data);
				options.onStdout?.(data);
				return { exitCode: 0 };
			},
		};
		const store = new ArtifactStore("session-a", agentDir);
		const tool = createBashToolDefinition(process.cwd(), {
			operations,
			artifactStore: store,
			toolOutputs: { maxStdoutPrefixLines: 10, maxStdoutSuffixLines: 10 },
		});

		const result = await tool.execute("short", { command: "short" }, undefined, undefined, {} as any);
		expect(result.details?.stdoutArtifactPath).toBeUndefined();
		expect(result.details?.stderrArtifactPath).toBeUndefined();
		expect(text(result)).not.toContain("Full stdout saved");
	});
});
