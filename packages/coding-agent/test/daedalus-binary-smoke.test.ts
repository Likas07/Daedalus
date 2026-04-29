import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const runSmoke = process.env.DAEDALUS_BINARY_SMOKE === "1";
const binaryPath = resolve(import.meta.dir, "../dist/daedalus");
const repoRoot = resolve(import.meta.dir, "../../..");

let agentDir: string | undefined;

describe.skipIf(!runSmoke)("compiled daedalus binary", () => {
	beforeAll(async () => {
		agentDir = await mkdtemp(join(tmpdir(), "daedalus-binary-smoke-"));
	});

	afterAll(async () => {
		if (agentDir) {
			await rm(agentDir, { recursive: true, force: true });
		}
	});

	test("loads bundled Daedalus extension prompts before provider failure", async () => {
		const timeoutMs = 30_000;
		const controller = new AbortController();
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeoutMs);

		const proc = Bun.spawn(
			[
				binaryPath,
				"--provider",
				"openai",
				"--model",
				"gpt-4o-mini",
				"--api-key",
				"sk-daedalus-binary-smoke-test",
				"--no-session",
				"--no-tools",
				"--print",
				"Smoke test prompt. Reply with ok.",
			],
			{
				cwd: repoRoot,
				env: {
					...process.env,
					DAEDALUS_OFFLINE: "1",
					DAEDALUS_CODING_AGENT_DIR: agentDir,
					DAEDALUS_SKIP_VERSION_CHECK: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
				signal: controller.signal,
			},
		);

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited.catch((error) => {
				if (timedOut) return null;
				throw error;
			}),
		]);
		clearTimeout(timeout);

		const output = `${stdout}\n${stderr}`;
		expect(timedOut, `Binary did not exit within ${timeoutMs}ms. Output:\n${output}`).toBe(false);
		expect(exitCode, `Binary did not report an exit code. Output:\n${output}`).not.toBeNull();

		const forbiddenPatterns = [/\bENOENT\b/, /\$bunfs\/root\/agents/, /Extension error/i, /<inline:\d+>/];
		for (const pattern of forbiddenPatterns) {
			expect(output, `Unexpected bundled extension prompt loading failure (${pattern}):\n${output}`).not.toMatch(
				pattern,
			);
		}
	}, 35_000);
});
