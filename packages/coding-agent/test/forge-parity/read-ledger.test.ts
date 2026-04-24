import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { ReadLedger } from "../../src/core/tools/read-ledger.js";

describe("ReadLedger", () => {
	it("keeps Phase 5 read-before-ever-edit policy separate from Phase 6 hash freshness", () => {
		const ledger = new ReadLedger("/tmp/work");
		ledger.markRead("src/a.ts", "hash-from-read");

		// Phase 5 only requires a successful read before the first edit/overwrite attempt.
		// Ledger hashes are retained for Phase 6 external-change detection; successful
		// Daedalus mutations do not yet force a reread or update this hash.
		expect(ledger.hasRead("/tmp/work/src/a.ts")).toBe(true);
		expect(ledger.getHash("/tmp/work/src/a.ts")).toBe("hash-from-read");
	});

	it("normalizes relative and absolute paths and stores optional hashes", () => {
		const ledger = new ReadLedger("/tmp/work");
		ledger.markRead("src/a.ts", "abc");
		expect(ledger.hasRead("/tmp/work/src/a.ts")).toBe(true);
		expect(ledger.hasRead(join("src", "..", "src", "a.ts"))).toBe(true);
		expect(ledger.getHash("/tmp/work/src/a.ts")).toBe("abc");
	});

	it("reconstructs from successful read assistant tool calls and tool results", () => {
		const entries: any[] = [
			{
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "toolCall", id: "tc1", name: "read", arguments: { path: "a.ts" } }],
				},
			},
			{ type: "message", message: { role: "toolResult", toolCallId: "tc1", toolName: "read", content: [] } },
			{
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "toolCall", id: "tc2", name: "read", arguments: { path: "b.ts" } }],
				},
			},
			{
				type: "message",
				message: { role: "toolResult", toolCallId: "tc2", toolName: "read", isError: true, content: [] },
			},
		];
		const ledger = new ReadLedger("/w", entries);
		expect(ledger.hasRead("/w/a.ts")).toBe(true);
		expect(ledger.hasRead("/w/b.ts")).toBe(false);
	});
});
