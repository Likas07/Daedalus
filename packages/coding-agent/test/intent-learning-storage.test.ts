import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { mergeIntentSamplesIntoStats } from "../src/extensions/daedalus/workflow/intent-learning/aggregate.js";
import { readIntentStatsFile, writeIntentStatsFile } from "../src/extensions/daedalus/workflow/intent-learning/storage.js";
import type { IntentTurnSample } from "../src/extensions/daedalus/workflow/intent-learning/types.js";

function sample(overrides: Partial<IntentTurnSample> = {}): IntentTurnSample {
	return {
		sampleId: "session-1:intent-1",
		sessionId: "session-1",
		cwd: "/repo",
		timestamp: new Date().toISOString(),
		intentEntryId: "intent-1",
		userMessageId: "user-1",
		userText: "Can you add intent learning?",
		surfaceForm: "implementation request",
		finalIntent: "implementation",
		mutationScope: "code-allowed",
		readOnly: false,
		intentSource: "assistant-line",
		mismatch: false,
		heuristicGuess: "implementation",
		...overrides,
	};
}

describe("intent learning storage", () => {
	test("writes and reads stats files and reruns stay idempotent", () => {
		const dir = mkdtempSync(join(tmpdir(), "intent-stats-"));
		const statsPath = join(dir, "intent-stats.json");

		try {
			const first = mergeIntentSamplesIntoStats(undefined, [sample()], statsPath);
			writeIntentStatsFile(first.statsFile, statsPath);
			const persisted = readIntentStatsFile(statsPath);
			expect(persisted.sampleCount).toBe(1);
			expect(Object.keys(persisted.features).length).toBeGreaterThan(0);

			const second = mergeIntentSamplesIntoStats(persisted, [sample()], statsPath);
			expect(second.summary.newSamples).toBe(0);
			expect(second.summary.duplicateSamples).toBe(1);
			expect(second.statsFile.sampleCount).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
