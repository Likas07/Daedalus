import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage, AgentState } from "@daedalus-pi/agent-core";
import { getModel } from "@daedalus-pi/ai";
import { AgentSession } from "../../src/core/agent-session.js";
import { SessionManager } from "../../src/core/session-manager.js";
import { SettingsManager } from "../../src/core/settings-manager.js";
import { createTestResourceLoader } from "../utilities.js";

function sha256(text: string): string {
	return createHash("sha256").update(Buffer.from(text)).digest("hex");
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = join(tmpdir(), `daedalus-external-reminder-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function createFakeSession(cwd: string): { session: AgentSession; prompts: AgentMessage[][] } {
	const prompts: AgentMessage[][] = [];
	const state: AgentState = {
		model: getModel("anthropic", "claude-sonnet-4-5")!,
		systemPrompt: "test",
		messages: [],
		tools: [],
		thinkingLevel: "off",
		fastMode: false,
	} as AgentState;
	const agent = {
		state,
		subscribe: () => () => {},
		beforeToolCall: undefined,
		afterToolCall: undefined,
		prompt: async (messages: AgentMessage | AgentMessage[]) => {
			const batch = Array.isArray(messages) ? messages : [messages];
			prompts.push(batch);
			state.messages.push(...batch);
		},
		waitForIdle: async () => {},
		clearAllQueues: () => {},
	} as any;
	const session = new AgentSession({
		agent,
		sessionManager: SessionManager.inMemory(),
		settingsManager: SettingsManager.inMemory(),
		cwd,
		modelRegistry: { hasConfiguredAuth: () => true, isUsingOAuth: () => false } as any,
		resourceLoader: createTestResourceLoader(),
	});
	return { session, prompts };
}

describe("external-change reminder", () => {
	it("injects a hidden droppable reminder before the request and suppresses duplicates", async () => {
		await withTempDir(async (dir) => {
			const file = join(dir, "a.ts");
			await writeFile(file, "old");
			const { session, prompts } = createFakeSession(dir);
			session.readLedger.markRead(file, sha256("old"));

			await writeFile(file, "new");
			await session.prompt("first turn");
			await session.prompt("second turn");

			const firstBatch = prompts[0];
			expect(firstBatch[0]).toMatchObject({
				role: "custom",
				customType: "external-change-reminder",
				display: false,
				droppable: true,
			});
			expect((firstBatch[0] as any).content).toBe(
				"<information><critical>The following files have been modified externally. Please re-read them if its relevant for the task.</critical><files><file>a.ts</file></files></information>",
			);
			expect(firstBatch[1].role).toBe("user");
			expect(prompts[1][0].role).toBe("user");
			expect(prompts[1]).toHaveLength(1);
			expect(session.readLedger.getHash(file)).toBe(sha256("new"));
			session.dispose();
		});
	});
});
