import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { getAgentResultOutput } from "../src/extensions/daedalus/tools/agent-result-store.js";

describe("agent result store", () => {
	it("returns the deferred output payload for a persisted result sidecar", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-agent-result-store-"));
		const parentSessionFile = path.join(root, "parent.jsonl");
		const directory = path.join(root, "parent", "subagents");
		fs.mkdirSync(directory, { recursive: true });
		fs.writeFileSync(
			path.join(directory, "run-1.result.json"),
			JSON.stringify(
				{
					resultId: "run-1",
					agentId: "worker",
					conversationId: "/tmp/parent/subagents/run-1.jsonl",
					task: "Fix auth",
					status: "completed",
					summary: "Normalized auth headers.",
					output: "Updated src/auth.ts to normalize Authorization headers before verification.",
				},
				null,
				2,
			),
		);

		const result = await getAgentResultOutput({ parentSessionFile, resultId: "run-1" });
		expect(result).toEqual({
			result_id: "run-1",
			conversation_id: "/tmp/parent/subagents/run-1.jsonl",
			status: "completed",
			output: "Updated src/auth.ts to normalize Authorization headers before verification.",
		});

		fs.rmSync(root, { recursive: true, force: true });
	});
});
