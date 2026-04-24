import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@daedalus-pi/agent-core";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultResourceLoader } from "../src/core/resource-loader.js";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import daedalusBundle from "../src/extensions/daedalus/bundle.js";
import { analyzeContextProfile } from "../src/extensions/daedalus/tools/context-profile/analyzer.js";
import { formatContextProfile } from "../src/extensions/daedalus/tools/context-profile/format.js";
import contextProfile from "../src/extensions/daedalus/tools/context-profile/index.js";

function user(text: string): AgentMessage {
	return { role: "user", content: text, timestamp: 1 } as AgentMessage;
}

function toolResult(toolName: string, text: string): AgentMessage {
	return {
		role: "toolResult",
		toolCallId: `call-${toolName}`,
		toolName,
		content: [{ type: "text", text }],
		isError: false,
		timestamp: 2,
	} as AgentMessage;
}

function assistantReadCall(id: string, path: string, offset?: number, limit?: number): AgentMessage {
	return {
		role: "assistant",
		content: [
			{
				type: "toolCall",
				id,
				name: "read",
				arguments: { path, ...(offset ? { offset } : {}), ...(limit ? { limit } : {}) },
			},
		],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "tool_use",
		timestamp: 1,
	} as AgentMessage;
}

function readResult(id: string, path: string, text: string): AgentMessage {
	return {
		role: "toolResult",
		toolCallId: id,
		toolName: "read",
		content: [{ type: "text", text }],
		details: { absolutePath: path },
		isError: false,
		timestamp: 2,
	} as AgentMessage;
}

describe("context profile analyzer", () => {
	it("reports repeated and overlapping read ranges", () => {
		const profile = analyzeContextProfile({
			systemPrompt: "",
			messages: [
				assistantReadCall("r1", "src/a.ts", 1, 100),
				readResult("r1", "/repo/src/a.ts", "a".repeat(1000)),
				assistantReadCall("r2", "src/a.ts", 50, 100),
				readResult("r2", "/repo/src/a.ts", "b".repeat(900)),
			],
			activeTools: ["read"],
			allTools: [{ name: "read" }],
			top: 5,
		});

		expect(profile.reads.byFile[0]).toMatchObject({ path: "/repo/src/a.ts", calls: 2, repeatedCalls: 1 });
		expect(profile.reads.byFile[0].overlaps).toHaveLength(1);
		expect(profile.warnings).toContainEqual(expect.objectContaining({ kind: "repeated_read", toolName: "read" }));
	});

	it("aggregates top messages, top tool results, and by-tool totals", () => {
		const profile = analyzeContextProfile({
			systemPrompt: "system prompt",
			messages: [
				user("hello"),
				toolResult("fs_search", "x".repeat(1000)),
				toolResult("bash", "y".repeat(200)),
				toolResult("fs_search", "z".repeat(300)),
			],
			activeTools: ["read", "fs_search"],
			allTools: [{ name: "read" }, { name: "fs_search" }],
			top: 5,
		});

		expect(profile.total.chars).toBeGreaterThan(1500);
		expect(profile.byTool[0]).toMatchObject({ toolName: "fs_search", calls: 2 });
		expect(profile.byTool[0].chars).toBeGreaterThan(profile.byTool[1].chars);
		expect(profile.topToolResults[0]).toMatchObject({ toolName: "fs_search", chars: 1000 });
		expect(profile.activeTools).toEqual(["read", "fs_search"]);
		expect(profile.inactiveTools).toEqual([]);
	});

	it("emits warnings for oversized tool results", () => {
		const profile = analyzeContextProfile({
			systemPrompt: "",
			messages: [toolResult("fs_search", "x".repeat(60_000))],
			activeTools: ["fs_search"],
			allTools: [{ name: "fs_search" }],
			top: 5,
		});

		expect(profile.warnings).toContainEqual(
			expect.objectContaining({ kind: "large_tool_result", toolName: "fs_search" }),
		);
	});
});

describe("context profile formatter", () => {
	it("renders deterministic human output", () => {
		const profile = analyzeContextProfile({
			systemPrompt: "system",
			messages: [toolResult("fs_search", "x".repeat(1000))],
			activeTools: ["fs_search"],
			allTools: [{ name: "fs_search" }, { name: "context_profile" }],
			top: 3,
		});

		const text = formatContextProfile(profile, { format: "text" });

		expect(text).toContain("Context profile");
		expect(text).toContain("Top tool results");
		expect(text).toContain("fs_search");
		expect(text).toContain("Inactive tools: context_profile");
	});

	it("renders JSON when requested", () => {
		const profile = analyzeContextProfile({ systemPrompt: "", messages: [], activeTools: [], allTools: [], top: 3 });
		const text = formatContextProfile(profile, { format: "json" });
		expect(JSON.parse(text)).toMatchObject({ messages: { count: 0 }, toolResults: { count: 0 } });
	});
});

describe("context profile extension", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-context-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	it("registers slash command and default-disabled tool", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
			extensionFactories: [contextProfile],
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
			resourceLoader,
		});
		await session.bindExtensions({});

		expect(session.extensionRunner?.getCommand("context-profile")).toBeDefined();
		expect(session.getAllTools().map((tool) => tool.name)).toContain("context_profile");
		expect(session.getActiveToolNames()).not.toContain("context_profile");

		session.setActiveToolsByName([...session.getActiveToolNames(), "context_profile"]);
		expect(session.getActiveToolNames()).toContain("context_profile");

		const result = await session
			.getToolDefinition("context_profile")!
			.execute("context-profile-tool-test", { top: 5, format: "text" }, undefined, undefined, {
				cwd: tempDir,
				sessionManager,
				getSystemPrompt: () => session.systemPrompt,
			} as any);
		expect(result.content[0]).toMatchObject({ type: "text" });
		expect(result.content[0].text).toContain("Context profile");

		session.dispose();
	});

	it("saves slash command output to a file by default instead of replacing editor text", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
			extensionFactories: [contextProfile],
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
			resourceLoader,
		});
		await session.bindExtensions({});

		const command = session.extensionRunner?.getCommand("context-profile");
		expect(command).toBeDefined();
		const notify = vi.fn();
		const setEditorText = vi.fn();
		await command!.handler("--top 3", {
			...session.extensionRunner!.createCommandContext(),
			ui: { notify, setEditorText },
		} as any);

		expect(setEditorText).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Context profile saved to"), "info");
		const reportDir = join(tempDir, ".daedalus", "context-profiles");
		const reports = readdirSync(reportDir);
		expect(reports).toHaveLength(1);
		expect(reports[0]).toMatch(/^context-profile-.*[.]txt$/);
		expect(readFileSync(join(reportDir, reports[0]), "utf8")).toContain("Context profile");

		session.dispose();
	});

	it("supports explicit --insert slash command output", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
			extensionFactories: [contextProfile],
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
			resourceLoader,
		});
		await session.bindExtensions({});

		const command = session.extensionRunner?.getCommand("context-profile");
		const notify = vi.fn();
		const setEditorText = vi.fn();
		await command!.handler("--insert", {
			...session.extensionRunner!.createCommandContext(),
			ui: { notify, setEditorText },
		} as any);

		expect(setEditorText).toHaveBeenCalledWith(expect.stringContaining("Context profile"));
		expect(notify).toHaveBeenCalledWith("Context profile written to editor", "info");
		expect(existsSync(join(tempDir, ".daedalus", "context-profiles"))).toBe(false);

		session.dispose();
	});
});

describe("context profile Daedalus bundle registration", () => {
	it("is included in the default Daedalus bundle but inactive by default", async () => {
		const tempDir = join(
			tmpdir(),
			`daedalus-context-profile-bundle-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		const agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
		try {
			const settingsManager = SettingsManager.create(tempDir, agentDir);
			const sessionManager = SessionManager.inMemory();
			const resourceLoader = new DefaultResourceLoader({
				cwd: tempDir,
				agentDir,
				settingsManager,
				extensionFactories: [daedalusBundle],
			});
			await resourceLoader.reload();

			const { session } = await createAgentSession({
				cwd: tempDir,
				agentDir,
				model: getModel("anthropic", "claude-sonnet-4-5")!,
				settingsManager,
				sessionManager,
				resourceLoader,
			});
			await session.bindExtensions({});

			expect(session.extensionRunner?.getCommand("context-profile")).toBeDefined();
			expect(session.getAllTools().map((tool) => tool.name)).toContain("context_profile");
			expect(session.getActiveToolNames()).not.toContain("context_profile");

			session.dispose();
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
