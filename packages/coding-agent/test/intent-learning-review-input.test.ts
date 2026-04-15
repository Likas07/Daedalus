import { describe, expect, test } from "vitest";
import { mergeIntentSamplesIntoStats } from "../src/extensions/daedalus/workflow/intent-learning/aggregate.js";
import { buildIntentReviewPayload, buildIntentReviewUserMessage } from "../src/extensions/daedalus/workflow/intent-learning/review-prompt.js";
import type { IntentTurnSample } from "../src/extensions/daedalus/workflow/intent-learning/types.js";

function sample(index: number, sessionId: string, userText: string, finalIntent: IntentTurnSample["finalIntent"]): IntentTurnSample {
	return {
		sampleId: `${sessionId}:intent-${index}`,
		sessionId,
		cwd: "/repo",
		timestamp: new Date().toISOString(),
		intentEntryId: `intent-${index}`,
		userMessageId: `user-${index}`,
		userText,
		surfaceForm: "request",
		finalIntent,
		mutationScope: finalIntent === "implementation" ? "code-allowed" : "none",
		readOnly: false,
		intentSource: "assistant-line",
		mismatch: false,
		heuristicGuess: finalIntent,
	};
}

describe("intent learning review payload", () => {
	test("contains aggregate evidence only with sanitized examples", () => {
		const samples = [
			sample(1, "session-a", "Can you add ```ts\nconst x = 1\n``` intent learning?", "implementation"),
			sample(2, "session-a", "Can you add a review command?", "implementation"),
			sample(3, "session-b", "Can you add a collect command?", "implementation"),
			sample(4, "session-b", "Can you add stats storage?", "implementation"),
			sample(5, "session-c", "Can you add heuristic review?", "implementation"),
		];
		const { statsFile } = mergeIntentSamplesIntoStats(undefined, samples, "/tmp/intent-stats.json");

		const payload = buildIntentReviewPayload(statsFile);
		const userMessage = buildIntentReviewUserMessage(statsFile);

		expect(payload.sampleCount).toBe(5);
		expect(payload.strongCandidates.length).toBeGreaterThan(0);
		expect(payload.strongCandidates[0]?.countsByIntent.implementation).toBeGreaterThan(0);
		expect(payload.strongCandidates[0]?.examples.join(" ")).not.toContain("```");
		expect(userMessage).not.toContain("tool noise");
		expect(userMessage).toContain('"strongCandidates"');
	});
});
