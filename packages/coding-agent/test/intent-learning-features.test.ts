import { describe, expect, test } from "vitest";
import { extractIntentFeatures, getCurrentHeuristicGuessForFeature } from "../src/extensions/daedalus/workflow/intent-learning/features.js";

describe("intent learning feature extraction", () => {
	test("extracts leading phrases and high-signal patterns", () => {
		const features = extractIntentFeatures("How does session compaction work in Daedalus?");
		const keys = features.map((feature) => feature.key);

		expect(keys).toContain("leading-1:how");
		expect(keys).toContain("leading-2:how does");
		expect(keys).toContain("leading-3:how does session");
		expect(keys).toContain("pattern:how does");
	});

	test("maps feature text through current built-in heuristic", () => {
		expect(getCurrentHeuristicGuessForFeature("can you add")).toBe("implementation");
		expect(getCurrentHeuristicGuessForFeature("how does")).toBe("research");
	});
});
