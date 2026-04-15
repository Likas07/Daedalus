import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { inferIntentMetadataFromUserText } from "../src/core/intent-gate.js";
import { applyIntentReviewSuggestions } from "../src/extensions/daedalus/workflow/intent-learning/apply.js";
import {
	getIntentHeuristicsFilePath,
	loadMergedIntentHeuristicRules,
	readIntentHeuristicsFile,
	writeIntentHeuristicsFile,
} from "../src/extensions/daedalus/workflow/intent-learning/preferences.js";
import type { IntentReviewResult } from "../src/extensions/daedalus/workflow/intent-learning/types.js";

describe("intent learning preferences", () => {
	test("global preferences load correctly and can be written from review suggestions", () => {
		const root = mkdtempSync(join(tmpdir(), "intent-heuristics-"));
		const cwd = join(root, "repo");
		const previousAgentDir = process.env.DAEDALUS_CODING_AGENT_DIR;
		process.env.DAEDALUS_CODING_AGENT_DIR = join(root, "agent");

		try {
			const review: IntentReviewResult = {
				add: [
					{
						id: "can-you-add",
						action: "add",
						feature: "can you add",
						kind: "pattern",
						targetIntent: "implementation",
						scope: "global",
						reason: "Repeated implementation phrasing",
						confidence: 0.95,
						totalCount: 8,
						sessionCount: 3,
						mismatchCount: 2,
						currentHeuristicGuess: "implementation",
						examples: ["Can you add a review command?"],
					},
				],
				strengthen: [],
				avoid: [],
				notes: [],
			};

			const applyResult = applyIntentReviewSuggestions(review, { cwd, scope: "global" });
			expect(applyResult.appliedCount).toBe(1);
			const file = readIntentHeuristicsFile(getIntentHeuristicsFilePath("global", cwd));
			expect(file.rules).toHaveLength(1);
			expect(file.rules[0]).toMatchObject({
				feature: "can you add",
				kind: "pattern",
				intent: "implementation",
				scope: "global",
			});
		} finally {
			if (previousAgentDir === undefined) delete process.env.DAEDALUS_CODING_AGENT_DIR;
			else process.env.DAEDALUS_CODING_AGENT_DIR = previousAgentDir;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project-local override merges ahead of global rules and beats built-in heuristics", () => {
		const root = mkdtempSync(join(tmpdir(), "intent-heuristics-"));
		const cwd = join(root, "repo");
		const previousAgentDir = process.env.DAEDALUS_CODING_AGENT_DIR;
		process.env.DAEDALUS_CODING_AGENT_DIR = join(root, "agent");

		try {
			writeIntentHeuristicsFile(
				{
					version: 1,
					updatedAt: new Date().toISOString(),
					rules: [
						{
							id: "global-how-does",
							feature: "how does",
							kind: "pattern",
							intent: "research",
							scope: "global",
							addedAt: new Date().toISOString(),
							source: "manual",
						},
					],
				},
				getIntentHeuristicsFilePath("global", cwd),
			);
			writeIntentHeuristicsFile(
				{
					version: 1,
					updatedAt: new Date().toISOString(),
					rules: [
						{
							id: "project-how-does",
							feature: "how does",
							kind: "pattern",
							intent: "implementation",
							scope: "project",
							addedAt: new Date().toISOString(),
							source: "manual",
						},
					],
				},
				getIntentHeuristicsFilePath("project", cwd),
			);

			const mergedRules = loadMergedIntentHeuristicRules(cwd);
			expect(mergedRules[0]).toMatchObject({ scope: "project", feature: "how does", intent: "implementation" });

			const withoutLearned = inferIntentMetadataFromUserText("How does session compaction work?");
			expect(withoutLearned.trueIntent).toBe("research");

			const withLearned = inferIntentMetadataFromUserText("How does session compaction work?", {
				learnedRules: mergedRules,
			});
			expect(withLearned.trueIntent).toBe("implementation");
			expect(withLearned.source).toBe("learned");

			const readOnlyOverride = inferIntentMetadataFromUserText("How does session compaction work? Please explain only.", {
				learnedRules: mergedRules,
			});
			expect(readOnlyOverride.trueIntent).toBe("implementation");
			expect(readOnlyOverride.readOnly).toBe(true);
			expect(readOnlyOverride.mutationScope).toBe("none");
		} finally {
			if (previousAgentDir === undefined) delete process.env.DAEDALUS_CODING_AGENT_DIR;
			else process.env.DAEDALUS_CODING_AGENT_DIR = previousAgentDir;
			rmSync(root, { recursive: true, force: true });
		}
	});
});
