import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createEditTool } from "../src/core/tools/edit.js";
import { computeLineHash, HashlineMismatchError } from "../src/core/tools/hashline/index.js";
import { createHashlineEditToolDefinition } from "../src/core/tools/hashline-edit.js";
import { createWriteTool } from "../src/core/tools/write.js";
import {
	createRemoteEditOps,
	createRemoteHashlineEditOps,
	createRemoteWriteOps,
} from "../src/extensions/daedalus/shared/ssh.js";
import { clearFakeSshBehavior, createFakeSshEnvironment, type FakeSshEnvironment } from "./helpers/fake-ssh.js";

const activeEnvironments: FakeSshEnvironment[] = [];

async function setupFakeSsh(prefix: string): Promise<FakeSshEnvironment> {
	const env = await createFakeSshEnvironment(prefix);
	activeEnvironments.push(env);
	return env;
}

function toRemoteFile(env: FakeSshEnvironment, relativePath: string): string {
	return join(env.remoteCwd, relativePath);
}

async function seedRemoteFile(env: FakeSshEnvironment, relativePath: string, content: string): Promise<void> {
	const filePath = toRemoteFile(env, relativePath);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, content, "utf8");
}

function createRemoteWriteTool(env: FakeSshEnvironment) {
	return createWriteTool(env.localCwd, {
		operations: createRemoteWriteOps(env.remote, env.remoteCwd, env.localCwd),
	});
}

function createRemoteEditTool(env: FakeSshEnvironment) {
	return createEditTool(env.localCwd, {
		operations: createRemoteEditOps(env.remote, env.remoteCwd, env.localCwd),
	});
}

function createRemoteHashlineTool(env: FakeSshEnvironment) {
	return createHashlineEditToolDefinition(env.localCwd, {
		operations: createRemoteHashlineEditOps(env.remote, env.remoteCwd, env.localCwd),
	});
}

afterEach(async () => {
	clearFakeSshBehavior();
	await Promise.all(activeEnvironments.splice(0).map((env) => env.cleanup()));
});

describe.skipIf(process.platform === "win32")("SSH remote mutation tools", () => {
	test("createRemoteWriteOps writes exact bytes and verifies them", async () => {
		const env = await setupFakeSsh("backend-write");
		const ops = createRemoteWriteOps(env.remote, env.remoteCwd, env.localCwd);
		const localPath = join(env.localCwd, "backend.txt");
		const content = "backend path\nsecond line\n";

		await ops.mkdir(dirname(localPath));
		await ops.writeFile(localPath, content);

		expect(await readFile(toRemoteFile(env, "backend.txt"), "utf8")).toBe(content);
	});

	test("write tool smoke test persists content remotely", async () => {
		const env = await setupFakeSsh("write-smoke");
		const tool = createRemoteWriteTool(env);
		const content = "write tool smoke test\nline 2\n";

		const result = await tool.execute("tool-1", { path: "write-smoke-test.txt", content });
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("Successfully wrote");
		expect(await readFile(toRemoteFile(env, "write-smoke-test.txt"), "utf8")).toBe(content);
	});

	test("write tool preserves shell metacharacters exactly", async () => {
		const env = await setupFakeSsh("write-special");
		const tool = createRemoteWriteTool(env);
		const content = [
			"$HOME",
			"`echo hi`",
			"single ' quote",
			'double " quote',
			"backslash \\",
			"unicode 🙂 café 漢字",
			"__DAEDALUS_EOF__",
		].join("\n");

		await tool.execute("tool-2", { path: "special.txt", content });
		expect(await readFile(toRemoteFile(env, "special.txt"), "utf8")).toBe(content);
	});

	test("write tool handles weird quoted paths", async () => {
		const env = await setupFakeSsh("write-paths");
		const tool = createRemoteWriteTool(env);
		const relativePath = "dir with spaces/o'hare $value.txt";
		const content = "quoted path\nworks\n";

		await tool.execute("tool-3", { path: relativePath, content });
		expect(await readFile(toRemoteFile(env, relativePath), "utf8")).toBe(content);
	});

	test("write tool intentionally supports empty files", async () => {
		const env = await setupFakeSsh("write-empty");
		const tool = createRemoteWriteTool(env);

		await tool.execute("tool-4", { path: "empty.txt", content: "" });
		expect(await readFile(toRemoteFile(env, "empty.txt"), "utf8")).toBe("");
	});

	test("write tool handles large payloads", async () => {
		const env = await setupFakeSsh("write-large");
		const tool = createRemoteWriteTool(env);
		const content = "chunk-🙂-1234567890\n".repeat(50_000);

		await tool.execute("tool-5", { path: "large.txt", content });
		expect(await readFile(toRemoteFile(env, "large.txt"), "utf8")).toBe(content);
	});

	test("edit tool applies multiple remote replacements", async () => {
		const env = await setupFakeSsh("edit-basic");
		const tool = createRemoteEditTool(env);
		await seedRemoteFile(env, "edit.txt", "alpha\nbeta\ngamma\n");

		const result = await tool.execute("tool-6", {
			path: "edit.txt",
			edits: [
				{ oldText: "alpha", newText: "ALPHA" },
				{ oldText: "beta", newText: "BETA" },
			],
		});

		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("Successfully replaced 2 block(s)");
		expect(await readFile(toRemoteFile(env, "edit.txt"), "utf8")).toBe("ALPHA\nBETA\ngamma\n");
	});

	test("edit tool preserves BOM and CRLF remotely", async () => {
		const env = await setupFakeSsh("edit-crlf");
		const tool = createRemoteEditTool(env);
		await seedRemoteFile(env, "crlf.txt", "\uFEFFbefore\r\nafter\r\n");

		await tool.execute("tool-7", {
			path: "crlf.txt",
			edits: [{ oldText: "after", newText: "AFTER" }],
		});

		expect(await readFile(toRemoteFile(env, "crlf.txt"), "utf8")).toBe("\uFEFFbefore\r\nAFTER\r\n");
	});

	test("hashline_edit applies anchored replacements remotely", async () => {
		const env = await setupFakeSsh("hashline-basic");
		const tool = createRemoteHashlineTool(env);
		await seedRemoteFile(env, "file.ts", "function a() {\n  old();\n}\n");

		const result = await tool.execute(
			"tool-8",
			{
				edits: [
					{
						path: "file.ts",
						op: "replace",
						pos: `2#${computeLineHash(2, "  old();")}`,
						lines: ["  next();"],
					},
				],
			},
			undefined,
			undefined,
			{} as any,
		);

		expect(result.details?.diff).toContain("next();");
		expect(await readFile(toRemoteFile(env, "file.ts"), "utf8")).toBe("function a() {\n  next();\n}\n");
	});

	test("hashline_edit preserves BOM and CRLF remotely", async () => {
		const env = await setupFakeSsh("hashline-crlf");
		const tool = createRemoteHashlineTool(env);
		await seedRemoteFile(env, "file.txt", "\uFEFFfirst\r\nsecond\r\n");

		await tool.execute(
			"tool-9",
			{
				edits: [
					{
						path: "file.txt",
						op: "replace",
						pos: `2#${computeLineHash(2, "second")}`,
						lines: ["SECOND"],
					},
				],
			},
			undefined,
			undefined,
			{} as any,
		);

		expect(await readFile(toRemoteFile(env, "file.txt"), "utf8")).toBe("\uFEFFfirst\r\nSECOND\r\n");
	});

	test("hashline_edit rejects stale anchors without changing the remote file", async () => {
		const env = await setupFakeSsh("hashline-stale");
		const tool = createRemoteHashlineTool(env);
		await seedRemoteFile(env, "stale.txt", "alpha\nbeta\n");

		await expect(
			tool.execute(
				"tool-10",
				{ edits: [{ path: "stale.txt", op: "replace", pos: "2#ZZ", lines: ["BETA"] }] },
				undefined,
				undefined,
				{} as any,
			),
		).rejects.toBeInstanceOf(HashlineMismatchError);
		expect(await readFile(toRemoteFile(env, "stale.txt"), "utf8")).toBe("alpha\nbeta\n");
	});

	test("write rejects exit-0 truncate false-success after verification", async () => {
		const env = await setupFakeSsh("write-false-success");
		const tool = createRemoteWriteTool(env);
		const target = toRemoteFile(env, "false-success.txt");
		process.env.FAKE_SSH_TAMPER_MODE = "truncate";
		process.env.FAKE_SSH_TAMPER_PATH = target;

		await expect(tool.execute("tool-11", { path: "false-success.txt", content: "should stay\n" })).rejects.toThrow(
			"Remote write verification failed",
		);
		expect(await readFile(target, "utf8")).toBe("");
	});

	test("write rejects exit-0 wrong-content false-success even with stderr noise", async () => {
		const env = await setupFakeSsh("write-wrong");
		const tool = createRemoteWriteTool(env);
		const target = toRemoteFile(env, "wrong.txt");
		process.env.FAKE_SSH_TAMPER_MODE = "wrong";
		process.env.FAKE_SSH_TAMPER_PATH = target;
		process.env.FAKE_SSH_TAMPER_CONTENT = "wrong\n";
		process.env.FAKE_SSH_STDERR = "warning: pretend success\n";

		await expect(tool.execute("tool-12", { path: "wrong.txt", content: "expected\n" })).rejects.toThrow(
			"Remote write verification failed",
		);
		expect(await readFile(target, "utf8")).toBe("wrong\n");
	});

	test("write, edit, and hashline_edit propagate non-zero write-phase exits", async () => {
		const env = await setupFakeSsh("write-exit");
		const writeTool = createRemoteWriteTool(env);
		const editTool = createRemoteEditTool(env);
		const hashlineTool = createRemoteHashlineTool(env);
		await seedRemoteFile(env, "edit-fail.txt", "before\n");
		await seedRemoteFile(env, "hashline-fail.txt", "alpha\nbeta\n");
		process.env.FAKE_SSH_FAIL_MATCH = "cat >";
		process.env.FAKE_SSH_FAIL_EXIT_CODE = "9";
		process.env.FAKE_SSH_STDERR = "simulated ssh failure\n";

		await expect(writeTool.execute("tool-13", { path: "write-fail.txt", content: "x\n" })).rejects.toThrow(
			"SSH failed (9): simulated ssh failure",
		);
		await expect(
			editTool.execute("tool-14", {
				path: "edit-fail.txt",
				edits: [{ oldText: "before", newText: "after" }],
			}),
		).rejects.toThrow("SSH failed (9): simulated ssh failure");
		await expect(
			hashlineTool.execute(
				"tool-15",
				{
					edits: [
						{
							path: "hashline-fail.txt",
							op: "replace",
							pos: `2#${computeLineHash(2, "beta")}`,
							lines: ["BETA"],
						},
					],
				},
				undefined,
				undefined,
				{} as any,
			),
		).rejects.toThrow("SSH failed (9): simulated ssh failure");

		expect(await readFile(toRemoteFile(env, "edit-fail.txt"), "utf8")).toBe("before\n");
		expect(await readFile(toRemoteFile(env, "hashline-fail.txt"), "utf8")).toBe("alpha\nbeta\n");
	});
});
