import { describe, expect, test } from "bun:test";
import type { SessionEntry } from "../src/core/session-manager.js";
import type { ActiveSubagentRun, SubagentRunResult } from "../src/core/subagents/index.js";
import { buildInspectorOptions } from "../src/extensions/daedalus/workflow/subagents/inspect.js";
import {
	buildSubagentNavigationModel,
	resolveSubagentParentFromEntries,
} from "../src/extensions/daedalus/workflow/subagents/navigation.js";

describe("subagent navigation", () => {
	test("orders running siblings first and resolves prev/next by child session", () => {
		const active: ActiveSubagentRun[] = [
			{
				runId: "b",
				agent: "worker",
				parentSessionFile: "/p.jsonl",
				status: "running",
				summary: "working",
				startedAt: 1,
				updatedAt: 10,
				childSessionFile: "/b.jsonl",
			},
		];
		const persisted: SubagentRunResult[] = [
			{
				runId: "a",
				agent: "sage",
				parentSessionFile: "/p.jsonl",
				status: "completed",
				summary: "done",
				childSessionFile: "/a.jsonl",
				updatedAt: 8,
			},
			{
				runId: "c",
				agent: "muse",
				parentSessionFile: "/p.jsonl",
				status: "completed",
				summary: "done",
				childSessionFile: "/c.jsonl",
				updatedAt: 7,
			},
		];
		const runs = buildInspectorOptions(active, persisted);
		const model = buildSubagentNavigationModel({
			runs,
			currentSessionFile: "/a.jsonl",
			parentSessionFile: "/p.jsonl",
		});
		expect(model.siblings.map((target) => target.sessionFile)).toEqual(["/b.jsonl", "/a.jsonl", "/c.jsonl"]);
		expect(model.previous?.sessionFile).toBe("/b.jsonl");
		expect(model.next?.sessionFile).toBe("/c.jsonl");
		expect(model.parent?.sessionFile).toBe("/p.jsonl");
	});

	test("falls back to subagent-run custom entry for parent", () => {
		const entries = [
			{ type: "custom", customType: "subagent-run", data: { parentSessionFile: "/parent.jsonl" } },
		] as SessionEntry[];
		expect(resolveSubagentParentFromEntries(entries)).toBe("/parent.jsonl");
	});
});
