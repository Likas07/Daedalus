/**
 * Test for compaction with thinking models.
 *
 * Tests both:
 * - Claude via Antigravity (google-gemini-cli API)
 * - Claude via real Anthropic API (anthropic-messages API)
 *
 * Reproduces issue where compact fails when maxTokens < thinkingBudget.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, type ThinkingLevel } from "@daedalus-pi/agent-core";
import { completeSimple, getModel, type Model } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentSession } from "../src/core/agent-session.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import { codingTools } from "../src/core/tools/index.js";
import { warnAndSkip } from "./helpers/bun-compat.js";
import {
	API_KEY,
	createTestResourceLoader,
	getRealAuthStorage,
	hasAuthForProvider,
	resolveApiKey,
} from "./utilities.js";

const HAS_ANTIGRAVITY_AUTH = hasAuthForProvider("google-antigravity");
const HAS_ANTHROPIC_AUTH = !!API_KEY;

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function getExternalServiceSkipReason(label: string, message: string): string | null {
	const normalized = message.toLowerCase();
	if (
		normalized.includes("cloud code assist api error (403)") ||
		normalized.includes("disabled in this account") ||
		normalized.includes("terms of service") ||
		normalized.includes("quota") ||
		normalized.includes("rate limit") ||
		normalized.includes("timed out") ||
		normalized.includes("enotfound") ||
		normalized.includes("econn") ||
		normalized.includes("network") ||
		normalized.includes("api key") ||
		normalized.includes("401") ||
		normalized.includes("403") ||
		normalized.includes("429")
	) {
		return `${label} unavailable for real compaction tests: ${message}`;
	}
	return null;
}

async function probeModelAvailability(
	label: string,
	model: Model<any> | undefined,
	apiKey: string | undefined,
): Promise<string | null> {
	if (!apiKey) {
		return `${label} API key could not be resolved`;
	}
	if (!model) {
		return `${label} model unavailable for real compaction tests`;
	}

	try {
		const response = await completeSimple(
			model,
			{
				systemPrompt: "Reply with OK only.",
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: "OK" }],
						timestamp: Date.now(),
					},
				],
			},
			{ apiKey, maxTokens: 32 },
		);

		if (response.stopReason === "error") {
			return getExternalServiceSkipReason(label, response.errorMessage ?? "Unknown external API error");
		}
	} catch (error) {
		return getExternalServiceSkipReason(label, errorMessage(error));
	}

	return null;
}

const ANTIGRAVITY_API_KEY = HAS_ANTIGRAVITY_AUTH ? await resolveApiKey("google-antigravity") : undefined;
const ANTIGRAVITY_SKIP_REASON = HAS_ANTIGRAVITY_AUTH
	? await probeModelAvailability(
			"google-antigravity",
			getModel("google-antigravity", "claude-sonnet-4-5") ?? undefined,
			ANTIGRAVITY_API_KEY,
		)
	: null;
const skipAntigravityTests =
	!HAS_ANTIGRAVITY_AUTH ||
	!ANTIGRAVITY_API_KEY ||
	(ANTIGRAVITY_SKIP_REASON ? warnAndSkip(ANTIGRAVITY_SKIP_REASON) : false);

const ANTHROPIC_SKIP_REASON = HAS_ANTHROPIC_AUTH
	? await probeModelAvailability("anthropic", getModel("anthropic", "claude-sonnet-4-5") ?? undefined, API_KEY)
	: null;
const skipAnthropicTests = !HAS_ANTHROPIC_AUTH || (ANTHROPIC_SKIP_REASON ? warnAndSkip(ANTHROPIC_SKIP_REASON) : false);

describe.skipIf(skipAntigravityTests)("Compaction with thinking models (Antigravity)", () => {
	let session: AgentSession;
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-thinking-compaction-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		if (session) {
			session.dispose();
		}
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true });
		}
	});

	function createSession(
		modelId: "claude-opus-4-5-thinking" | "claude-sonnet-4-5",
		thinkingLevel: ThinkingLevel = "high",
	) {
		const model = getModel("google-antigravity", modelId);
		if (!model) {
			throw new Error(`Model not found: google-antigravity/${modelId}`);
		}

		const agent = new Agent({
			getApiKey: () => ANTIGRAVITY_API_KEY!,
			initialState: {
				model,
				systemPrompt: "You are a helpful assistant. Be concise.",
				tools: codingTools,
				thinkingLevel,
			},
		});

		const sessionManager = SessionManager.inMemory();
		const settingsManager = SettingsManager.create(tempDir, tempDir);
		const authStorage = getRealAuthStorage();
		const modelRegistry = ModelRegistry.create(authStorage);

		session = new AgentSession({
			agent,
			sessionManager,
			settingsManager,
			cwd: tempDir,
			modelRegistry,
			resourceLoader: createTestResourceLoader(),
		});

		session.subscribe(() => {});
		return session;
	}

	it("should compact successfully with claude-opus-4-5-thinking and thinking level high", async () => {
		createSession("claude-opus-4-5-thinking", "high");

		await session.prompt("Write down the first 10 prime numbers.");
		await session.agent.waitForIdle();

		const messages = session.messages;
		expect(messages.length).toBeGreaterThan(0);

		const assistantMessages = messages.filter((message) => message.role === "assistant");
		expect(assistantMessages.length).toBeGreaterThan(0);

		const result = await session.compact();

		expect(result.summary).toBeDefined();
		expect(result.summary.length).toBeGreaterThan(0);
		expect(result.tokensBefore).toBeGreaterThan(0);

		const messagesAfterCompact = session.messages;
		expect(messagesAfterCompact.length).toBeGreaterThan(0);
		expect(messagesAfterCompact[0].role).toBe("compactionSummary");
	}, 180000);

	it("should compact successfully with claude-sonnet-4-5 (non-thinking) for comparison", async () => {
		createSession("claude-sonnet-4-5", "off");

		await session.prompt("Write down the first 10 prime numbers.");
		await session.agent.waitForIdle();

		const messages = session.messages;
		expect(messages.length).toBeGreaterThan(0);

		const result = await session.compact();

		expect(result.summary).toBeDefined();
		expect(result.summary.length).toBeGreaterThan(0);
	}, 180000);
});

// ============================================================================
// Real Anthropic API tests (for comparison)
// ============================================================================

describe.skipIf(skipAnthropicTests)("Compaction with thinking models (Anthropic)", () => {
	let session: AgentSession;
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-thinking-compaction-anthropic-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		if (session) {
			session.dispose();
		}
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true });
		}
	});

	function createSession(model: Model<any>, thinkingLevel: ThinkingLevel = "high") {
		const agent = new Agent({
			getApiKey: () => API_KEY,
			initialState: {
				model,
				systemPrompt: "You are a helpful assistant. Be concise.",
				tools: codingTools,
				thinkingLevel,
			},
		});

		const sessionManager = SessionManager.inMemory();
		const settingsManager = SettingsManager.create(tempDir, tempDir);
		const authStorage = getRealAuthStorage();
		const modelRegistry = ModelRegistry.create(authStorage);

		session = new AgentSession({
			agent,
			sessionManager,
			settingsManager,
			cwd: tempDir,
			modelRegistry,
			resourceLoader: createTestResourceLoader(),
		});

		session.subscribe(() => {});
		return session;
	}

	it("should compact successfully with claude-sonnet-4-5 and thinking level high", async () => {
		const model = getModel("anthropic", "claude-sonnet-4-5");
		if (!model) {
			throw new Error("Model not found: anthropic/claude-sonnet-4-5");
		}
		createSession(model, "high");

		await session.prompt("Write down the first 10 prime numbers.");
		await session.agent.waitForIdle();

		const messages = session.messages;
		expect(messages.length).toBeGreaterThan(0);

		const assistantMessages = messages.filter((message) => message.role === "assistant");
		expect(assistantMessages.length).toBeGreaterThan(0);

		const result = await session.compact();

		expect(result.summary).toBeDefined();
		expect(result.summary.length).toBeGreaterThan(0);
		expect(result.tokensBefore).toBeGreaterThan(0);

		const messagesAfterCompact = session.messages;
		expect(messagesAfterCompact.length).toBeGreaterThan(0);
		expect(messagesAfterCompact[0].role).toBe("compactionSummary");
	}, 180000);
});
