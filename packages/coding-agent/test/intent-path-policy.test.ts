import { describe, expect, test } from "vitest";
import {
	getPlanningDirectoryForArtifactKind,
	isAllowedPlanningDirPath,
	isAllowedPlanningPath,
	resolvePlanningPath,
	suggestPlanningPath,
} from "../src/core/intent-path-policy.js";

describe("intent path policy", () => {
	const cwd = "/repo";

	test("allows markdown only in planning directories and root exceptions", () => {
		expect(isAllowedPlanningPath("docs/guide.md", cwd)).toBe(true);
		expect(isAllowedPlanningPath("plans/2026-04-14-intent-gate.md", cwd)).toBe(true);
		expect(isAllowedPlanningPath("specs/intent-gate.md", cwd)).toBe(true);
		expect(isAllowedPlanningPath("design/intent-gate.md", cwd)).toBe(true);
		expect(isAllowedPlanningPath("README.md", cwd)).toBe(true);
	});

	test("blocks markdown outside planning directories and non-markdown files", () => {
		expect(isAllowedPlanningPath("src/intent-gate.md", cwd)).toBe(false);
		expect(isAllowedPlanningPath("docs/intent-gate.txt", cwd)).toBe(false);
		expect(isAllowedPlanningPath("node_modules/pkg/readme.md", cwd)).toBe(false);
		expect(isAllowedPlanningPath(".github/intent-gate.md", cwd)).toBe(false);
		expect(isAllowedPlanningDirPath("plans/subdir", cwd)).toBe(true);
		expect(isAllowedPlanningDirPath("src/subdir", cwd)).toBe(false);
	});

	test("routes planning artifacts by kind", () => {
		expect(getPlanningDirectoryForArtifactKind("docs")).toBe("docs");
		expect(getPlanningDirectoryForArtifactKind("plan")).toBe("plans");
		expect(getPlanningDirectoryForArtifactKind("spec")).toBe("specs");
		expect(getPlanningDirectoryForArtifactKind("design")).toBe("design");

		expect(resolvePlanningPath({ cwd, artifactKind: "plan", topic: "intent gate v2", date: "2026-04-14" })).toBe(
			"plans/2026-04-14-intent-gate-v2.md",
		);
		expect(resolvePlanningPath({ cwd, artifactKind: "docs", topic: "intent gate overview" })).toBe(
			"docs/intent-gate-overview.md",
		);
	});

	test("suggests safe planning fallback path", () => {
		expect(suggestPlanningPath("src/intent-gate.md", cwd, "spec")).toMatch(/^specs\/\d{4}-\d{2}-\d{2}-intent-gate\.md$/u);
	});
});
