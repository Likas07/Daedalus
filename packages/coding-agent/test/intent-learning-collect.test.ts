import { describe, expect, test } from "vitest";
import { SessionManager } from "../src/core/session-manager.js";
import { collectIntentTurnSamplesFromBranch } from "../src/extensions/daedalus/workflow/intent-learning/collect.js";
import { assistantMsg, userMsg } from "./utilities.js";

describe("intent learning collector", () => {
	test("pairs user turns with final intent entries and ignores tool noise", () => {
		const session = SessionManager.inMemory("/repo");
		const userId = session.appendMessage(userMsg("Can you add a new /intent-collect command?"));
		session.appendMessage({
			role: "toolResult",
			toolCallId: "call-1",
			toolName: "read",
			content: [{ type: "text", text: "tool noise" }],
			isError: false,
			timestamp: Date.now(),
		});
		const assistantId = session.appendMessage(assistantMsg("Intent: implementation — inspect context first, then implement"));
		session.appendIntent({
			requestId: "request-1",
			turnIndex: 0,
			metadata: {
				surfaceForm: "implementation request",
				trueIntent: "implementation",
				approach: "inspect context first, then implement",
				readOnly: false,
				mutationScope: "code-allowed",
				source: "assistant-line",
				valid: true,
			},
			userMessageId: userId,
			requestText: "Can you add a new /intent-collect command?",
			assistantMessageId: assistantId,
			locked: true,
		});

		const samples = collectIntentTurnSamplesFromBranch({
			sessionId: session.getSessionId(),
			cwd: session.getCwd(),
			branch: session.getBranch(),
		});

		expect(samples).toHaveLength(1);
		expect(samples[0]).toMatchObject({
			userMessageId: userId,
			finalIntent: "implementation",
			heuristicGuess: "implementation",
			mismatch: false,
		});
	});

	test("flags mismatches between current heuristic and final persisted intent", () => {
		const session = SessionManager.inMemory("/repo");
		const userId = session.appendMessage(userMsg("Why does this test fail?"));
		const assistantId = session.appendMessage(assistantMsg("Intent: evaluation — assess options and propose only"));
		session.appendIntent({
			requestId: "request-2",
			turnIndex: 0,
			metadata: {
				surfaceForm: "evaluation request",
				trueIntent: "evaluation",
				approach: "assess options and propose only",
				readOnly: false,
				mutationScope: "none",
				source: "assistant-line",
				valid: true,
			},
			userMessageId: userId,
			requestText: "Why does this test fail?",
			assistantMessageId: assistantId,
			locked: true,
		});

		const [sample] = collectIntentTurnSamplesFromBranch({
			sessionId: session.getSessionId(),
			cwd: session.getCwd(),
			branch: session.getBranch(),
		});

		expect(sample.heuristicGuess).toBe("fix");
		expect(sample.finalIntent).toBe("evaluation");
		expect(sample.mismatch).toBe(true);
	});

	test("skips synthetic or unlinked intent records instead of back-attributing them", () => {
		const session = SessionManager.inMemory("/repo");
		session.appendMessage(userMsg("Plan this feature"));
		session.appendMessage(assistantMsg("Intent: planning — inspect context and write plan docs only."));
		session.appendIntent({
			requestId: "synthetic-request",
			turnIndex: 1,
			metadata: {
				trueIntent: "fix",
				approach: "diagnose root cause, patch minimally, verify.",
				readOnly: false,
				mutationScope: "code-allowed",
				source: "assistant-line",
				valid: true,
			},
			requestText: "Execute approved plan",
			synthetic: true,
			locked: true,
		});
		session.appendIntent({
			requestId: "unlinked-request",
			turnIndex: 2,
			metadata: {
				trueIntent: "evaluation",
				approach: "assess options and propose only.",
				readOnly: false,
				mutationScope: "none",
				source: "assistant-line",
				valid: true,
			},
			requestText: "What should we do?",
			locked: true,
		});

		const samples = collectIntentTurnSamplesFromBranch({
			sessionId: session.getSessionId(),
			cwd: session.getCwd(),
			branch: session.getBranch(),
		});

		expect(samples).toHaveLength(0);
	});
});
