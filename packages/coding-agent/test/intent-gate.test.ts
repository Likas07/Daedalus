import { describe, expect, test } from "vitest";
import {
	buildIntentGatePromptBlock,
	chooseMoreRestrictiveMutationScope,
	inferIntentMetadataFromUserText,
	INTENT_GATE_EXAMPLES,
	INTENT_GATE_LINE_FORMAT,
	INTENT_GATE_TYPES,
	parseIntentLine,
} from "../src/core/intent-gate.js";

describe("intent gate helper", () => {
	test("exports stable visible line format and type set", () => {
		expect(INTENT_GATE_TYPES).toEqual([
			"research",
			"planning",
			"implementation",
			"investigation",
			"evaluation",
			"fix",
			"open-ended",
		]);
		expect(INTENT_GATE_LINE_FORMAT).toBe(
			"Intent: <research|planning|implementation|investigation|evaluation|fix|open-ended> — <brief approach>",
		);
	});

	test("prompt block includes contract and examples remain brief", () => {
		const block = buildIntentGatePromptBlock();
		expect(block).toContain("## Intent Gate (every turn)");
		expect(block).toContain(INTENT_GATE_LINE_FORMAT);
		expect(block).toContain("surface form");
		expect(block).toContain("docs/, plans/, specs/, or design/");
		expect(block).toContain("read-only behavior");
		expect(block).toContain('read(format: "hashline") before hashline_edit');
		const inferred = inferIntentMetadataFromUserText("Fix footer cost formatting to BRL and verify");
		expect(inferred).toMatchObject({
			trueIntent: "fix",
			mutationScope: "code-allowed",
			source: "inferred",
		});
		expect(chooseMoreRestrictiveMutationScope("code-allowed", "none")).toBe("none");
		expect(inferIntentMetadataFromUserText("How does session compaction work?").trueIntent).toBe("research");
		expect(inferIntentMetadataFromUserText("How do I configure providers?").trueIntent).toBe("research");
		expect(inferIntentMetadataFromUserText("Why does this test fail?").trueIntent).toBe("fix");
		expect(inferIntentMetadataFromUserText("Can you add BRL cost display in footer?").trueIntent).toBe("implementation");
		expect(inferIntentMetadataFromUserText("What is best way to handle this migration?").trueIntent).toBe("evaluation");
		const parsed = parseIntentLine("Intent: planning — inspect context and write plan docs only.", {
			userText: "Please write a plan and do not change code",
		});
		expect(parsed).toMatchObject({
			trueIntent: "planning",
			mutationScope: "none",
			readOnly: true,
		});
		for (const example of INTENT_GATE_EXAMPLES) {
			expect(example.startsWith("Intent: ")).toBe(true);
		}
	});
});
