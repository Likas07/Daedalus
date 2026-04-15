import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { shellQuote, sshBash, sshBashText, sshExecDetailed } from "../src/extensions/daedalus/shared/ssh.js";
import { clearFakeSshBehavior, createFakeSshEnvironment, type FakeSshEnvironment } from "./helpers/fake-ssh.js";

const activeEnvironments: FakeSshEnvironment[] = [];

async function setupFakeSsh(prefix: string): Promise<FakeSshEnvironment> {
	const env = await createFakeSshEnvironment(prefix);
	activeEnvironments.push(env);
	return env;
}

afterEach(async () => {
	clearFakeSshBehavior();
	await Promise.all(activeEnvironments.splice(0).map((env) => env.cleanup()));
});

describe.skipIf(process.platform === "win32")("SSH shared helpers", () => {
	test("shellQuote uses POSIX shell escaping", () => {
		const weird = "$HOME `echo hi` \\";
		expect(shellQuote("")).toBe("''");
		expect(shellQuote("plain text")).toBe("'plain text'");
		expect(shellQuote("o'hare")).toBe("'o'\\''hare'");
		expect(shellQuote(weird)).toBe(`'${weird}'`);
		expect(shellQuote("line 1\nline 2")).toBe("'line 1\nline 2'");
	});

	test("sshExecDetailed pipes stdin and collects stdout/stderr", async () => {
		const env = await setupFakeSsh("shared-stdio");
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];

		const result = await sshExecDetailed(env.remote, "tr '[:lower:]' '[:upper:]'; printf 'warn' >&2", {
			stdin: "payload",
			onStdout: (chunk) => stdoutChunks.push(chunk),
			onStderr: (chunk) => stderrChunks.push(chunk),
		});

		expect(result.stdout.toString()).toBe("PAYLOAD");
		expect(result.stderr.toString()).toBe("warn");
		expect(Buffer.concat(stdoutChunks).toString()).toBe("PAYLOAD");
		expect(Buffer.concat(stderrChunks).toString()).toBe("warn");
	});

	test("sshExecDetailed rejects immediately when already aborted", async () => {
		const env = await setupFakeSsh("shared-abort");
		const controller = new AbortController();
		controller.abort();

		await expect(sshExecDetailed(env.remote, "echo hi", { signal: controller.signal })).rejects.toThrow(
			"Operation aborted",
		);
	});

	test("sshBash runs multiline scripts over SSH", async () => {
		const env = await setupFakeSsh("shared-bash");
		const outputPath = join(env.remoteCwd, "script-output.txt");
		const script = `printf 'one\n' > ${shellQuote(outputPath)}\nprintf 'two\n' >> ${shellQuote(outputPath)}\n`;

		await sshBash(env.remote, script);
		expect(await readFile(outputPath, "utf8")).toBe("one\ntwo\n");
	});

	test("sshBashText propagates stderr for non-zero exits", async () => {
		const env = await setupFakeSsh("shared-stderr");

		await expect(sshBashText(env.remote, "printf 'boom' >&2\nexit 7\n")).rejects.toThrow("SSH failed (7): boom");
	});
});
