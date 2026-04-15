import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { ExtensionRunner } from "../src/core/extensions/runner.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";
import { computeLineHash } from "../src/core/tools/hashline/index.js";
import sshExtension from "../src/extensions/daedalus/tools/ssh.js";
import { clearFakeSshBehavior, createFakeSshEnvironment, type FakeSshEnvironment } from "./helpers/fake-ssh.js";
import { createTestExtensionsResult } from "./utilities.js";

const originalCwd = process.cwd();
const activeEnvironments: FakeSshEnvironment[] = [];

async function setupFakeSsh(prefix: string): Promise<FakeSshEnvironment> {
	const env = await createFakeSshEnvironment(prefix);
	activeEnvironments.push(env);
	return env;
}

async function createRunner(env: FakeSshEnvironment): Promise<ExtensionRunner> {
	process.chdir(env.localCwd);
	const extensionsResult = await createTestExtensionsResult(
		[{ factory: sshExtension, path: "<ssh-extension-test>" }],
		env.localCwd,
	);
	const runner = new ExtensionRunner(
		extensionsResult.extensions,
		extensionsResult.runtime,
		env.localCwd,
		SessionManager.inMemory(),
		ModelRegistry.inMemory(AuthStorage.inMemory()),
	);

	runner.bindCore(
		{
			sendMessage: () => {},
			sendUserMessage: () => {},
			appendEntry: () => {},
			setSessionName: () => {},
			getSessionName: () => undefined,
			setLabel: () => {},
			getActiveTools: () => [],
			getAllTools: () => [],
			setActiveTools: () => {},
			refreshTools: () => {},
			getCommands: () => [],
			setModel: () => {},
			getThinkingLevel: () => undefined,
			setThinkingLevel: () => {},
		} as any,
		{
			getModel: () => undefined,
			isIdle: () => true,
			getSignal: () => undefined,
			abort: () => {},
			hasPendingMessages: () => false,
			shutdown: () => {},
			getContextUsage: () => undefined,
			compact: () => {},
			getSystemPrompt: () => "You are a test assistant.",
		} as any,
	);
	return runner;
}

afterEach(async () => {
	process.chdir(originalCwd);
	clearFakeSshBehavior();
	await Promise.all(activeEnvironments.splice(0).map((env) => env.cleanup()));
});

describe.skipIf(process.platform === "win32")("SSH extension wiring", () => {
	test("routes write/edit/hashline_edit through remote ops when --ssh is set", async () => {
		const env = await setupFakeSsh("extension-routing");
		await writeFile(join(env.remoteCwd, "edit.txt"), "before\n", "utf8");
		await writeFile(join(env.remoteCwd, "hashline.txt"), "alpha\nbeta\n", "utf8");
		const runner = await createRunner(env);
		runner.setFlagValue("ssh", `${env.remote}:${env.remoteCwd}`);

		await runner.emit({ type: "session_start", reason: "startup" });

		const writeTool = runner.getToolDefinition("write");
		const editTool = runner.getToolDefinition("edit");
		const hashlineTool = runner.getToolDefinition("hashline_edit");
		expect(writeTool).toBeDefined();
		expect(editTool).toBeDefined();
		expect(hashlineTool).toBeDefined();

		await writeTool!.execute("tool-1", { path: "write.txt", content: "via extension\n" });
		await editTool!.execute("tool-2", {
			path: "edit.txt",
			edits: [{ oldText: "before", newText: "after" }],
		});
		await hashlineTool!.execute("tool-3", {
			path: "hashline.txt",
			edits: [
				{
					loc: {
						range: {
							pos: `2#${computeLineHash(2, "beta")}`,
							end: `2#${computeLineHash(2, "beta")}`,
						},
					},
					content: ["BETA"],
				},
			],
		});

		expect(await readFile(join(env.remoteCwd, "write.txt"), "utf8")).toBe("via extension\n");
		expect(await readFile(join(env.remoteCwd, "edit.txt"), "utf8")).toBe("after\n");
		expect(await readFile(join(env.remoteCwd, "hashline.txt"), "utf8")).toBe("alpha\nBETA\n");
	});

	test("before_agent_start rewrites cwd in the system prompt for SSH sessions", async () => {
		const env = await setupFakeSsh("extension-prompt");
		const runner = await createRunner(env);
		runner.setFlagValue("ssh", `${env.remote}:${env.remoteCwd}`);

		await runner.emit({ type: "session_start", reason: "startup" });
		const result = await runner.emitBeforeAgentStart(
			"hello",
			undefined,
			`System prompt\nCurrent working directory: ${env.localCwd}`,
		);

		expect(result?.systemPrompt).toContain(`Current working directory: ${env.remoteCwd} (via SSH: ${env.remote})`);
	});
});
