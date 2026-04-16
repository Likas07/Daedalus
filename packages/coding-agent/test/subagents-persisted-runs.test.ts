import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listPersistedSubagentRuns, writePersistedSubagentRun } from "../src/core/subagents/index.js";

describe("persisted subagent runs", () => {
	const tempRoots: string[] = [];

	afterEach(() => {
		for (const dir of tempRoots.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("returns an empty list when the parent session has no subagent artifacts", async () => {
		expect(await listPersistedSubagentRuns(undefined)).toEqual([]);
		expect(await listPersistedSubagentRuns("/tmp/missing-parent.jsonl")).toEqual([]);
	});

	it("reads .meta.json files and sorts runs by most recent update", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-subagent-meta-"));
		tempRoots.push(root);
		const parentSessionFile = path.join(root, "parent.jsonl");
		const subagentDir = path.join(root, "parent", "subagents");

		await writePersistedSubagentRun(path.join(subagentDir, "run-1.meta.json"), {
			runId: "run-1",
			agent: "scout",
			status: "completed",
			summary: "Mapped auth flow",
			childSessionFile: path.join(subagentDir, "run-1.jsonl"),
			startedAt: 100,
			updatedAt: 200,
		});
		await writePersistedSubagentRun(path.join(subagentDir, "run-2.meta.json"), {
			runId: "run-2",
			agent: "worker",
			status: "running",
			summary: "Editing auth flow",
			childSessionFile: path.join(subagentDir, "run-2.jsonl"),
			startedAt: 150,
			updatedAt: 400,
			activity: "hashline_edit src/auth.ts",
		});

		const runs = await listPersistedSubagentRuns(parentSessionFile);
		expect(runs.map((run) => run.runId)).toEqual(["run-2", "run-1"]);
		expect(runs[0]?.activity).toBe("hashline_edit src/auth.ts");
	});
});
