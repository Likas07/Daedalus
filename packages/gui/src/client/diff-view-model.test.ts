import { describe, expect, test } from "bun:test";
import { buildDiffReviewViewModel } from "./diff-view-model";
import type { RendererDiffSummary } from "./gui-state-types";

const patch = `diff --git a/src/a.ts b/src/a.ts
index 1..2 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/test/b.test.ts b/test/b.test.ts
index 1..2 100644
--- a/test/b.test.ts
+++ b/test/b.test.ts
@@ -1 +1 @@
-no
+yes`;

const diff: RendererDiffSummary = {
	branch: "main",
	upstream: null,
	ahead: 0,
	behind: 0,
	stagedCount: 0,
	unstagedCount: 2,
	patch,
	riskyGroups: ["source", "tests"],
	files: [
		{ path: "src/a.ts", status: "modified", staged: false, insertions: 1, deletions: 1, riskGroup: "source" },
		{ path: "test/b.test.ts", status: "modified", staged: false, insertions: 1, deletions: 1, riskGroup: "tests" },
	],
};

describe("buildDiffReviewViewModel", () => {
	test("models changed files as a selectable tree with diff ids", () => {
		const model = buildDiffReviewViewModel({
			diff,
			selectedPath: "test/b.test.ts",
			workingTreeDiffId: "repo",
			checkpointDiffId: "cp",
		});
		expect(model.selectedPath).toBe("test/b.test.ts");
		expect(model.workingTreeDiffId).toBe("repo");
		expect(model.checkpointDiffId).toBe("cp");
		expect(model.tree.map((node) => node.path)).toEqual(["src", "test"]);
		expect(model.selectedPatch).toContain("b/test/b.test.ts");
		expect(model.selectedPatch).not.toContain("b/src/a.ts");
	});

	test("file click selection updates selected patch", () => {
		const model = buildDiffReviewViewModel({ diff, selectedPath: "src/a.ts" });
		expect(model.selectedPatch).toContain("b/src/a.ts");
		expect(model.selectedPatch).not.toContain("b/test/b.test.ts");
	});

	test("mutations stay disabled until capability and approval policy allow", () => {
		expect(
			buildDiffReviewViewModel({
				diff,
				capabilities: {},
				accessPolicy: {
					mode: "unrestricted",
					autoApproveSoftPrompts: true,
					bypassHardBlocks: false,
					auditRequired: true,
				},
			}).canMutate,
		).toBe(false);
		expect(
			buildDiffReviewViewModel({
				diff,
				capabilities: { gitMutations: true },
				accessPolicy: {
					mode: "supervised",
					autoApproveSoftPrompts: false,
					bypassHardBlocks: false,
					auditRequired: true,
				},
			}).canMutate,
		).toBe(false);
		expect(
			buildDiffReviewViewModel({
				diff,
				capabilities: { gitMutations: true },
				accessPolicy: {
					mode: "unrestricted",
					autoApproveSoftPrompts: true,
					bypassHardBlocks: false,
					auditRequired: true,
				},
			}).canMutate,
		).toBe(true);
	});

	test("defaults diff review to selected session target when runsIn is present", () => {
		const model = buildDiffReviewViewModel({
			diff,
			selectedSession: {
				id: "s1",
				title: "safe",
				status: "running",
				runsIn: {
					projectId: "project-1",
					worktreeId: "wt-1",
					path: "/repo/wt-1",
					canonicalPath: "/repo/wt-1",
					branch: "safe",
					isolationMode: "isolated-worktree",
					validationStatus: "valid",
				},
			},
		});
		expect(model.target).toEqual({ kind: "session", sessionId: "s1" });
		expect(model.targetStatus).toBe("ready");
	});

	test("blocks diff review when explicit target mismatches selected runsIn", () => {
		const model = buildDiffReviewViewModel({
			diff,
			selectedSession: {
				id: "s1",
				title: "safe",
				status: "running",
				runsIn: {
					projectId: "project-1",
					worktreeId: "wt-1",
					path: "/repo/wt-1",
					canonicalPath: "/repo/wt-1",
					branch: "safe",
					isolationMode: "isolated-worktree",
					validationStatus: "valid",
				},
			},
			target: { kind: "worktree", projectId: "project-1", worktreeId: "wt-2" },
			capabilities: { gitMutations: true },
			accessPolicy: {
				mode: "unrestricted",
				autoApproveSoftPrompts: true,
				bypassHardBlocks: false,
				auditRequired: true,
			},
		});
		expect(model.targetStatus).toBe("blocked");
		expect(model.canMutate).toBe(false);
		expect(model.targetWarning).toContain("worktree");
	});
});

test("blocks patch content when returned diff target differs from selected runsIn", () => {
	const model = buildDiffReviewViewModel({
		diff: { ...diff, target: { kind: "worktree", projectId: "project-1", worktreeId: "wt-other" } },
		selectedPath: "src/a.ts",
		selectedSession: {
			id: "s1",
			title: "safe",
			status: "running",
			runsIn: {
				projectId: "project-1",
				worktreeId: "wt-1",
				path: "/repo/wt-1",
				canonicalPath: "/repo/wt-1",
				branch: "safe",
				isolationMode: "isolated-worktree",
				validationStatus: "valid",
			},
		},
	});
	expect(model.targetStatus).toBe("blocked");
	expect(model.selectedPatch).toBe("");
	expect(model.targetWarning).toContain("worktree");
});
