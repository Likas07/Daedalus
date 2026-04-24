import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReadToolDefinition } from "../src/core/tools/read.js";
import { ReadLedger } from "../src/core/tools/read-ledger.js";

function text(result: any): string {
	return result.content
		.filter((block: any) => block.type === "text")
		.map((block: any) => block.text)
		.join("\n");
}

describe("read repeated-read hints", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-read-ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
		writeFileSync(join(tempDir, "target.ts"), "export const value = 1;\n");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("adds a lightweight hint when a file was already read", async () => {
		const ledger = new ReadLedger(tempDir);
		ledger.markRead("target.ts", "previous-hash");
		const read = createReadToolDefinition(tempDir);

		const result = await read.execute("read-repeat", { path: "target.ts" }, undefined, undefined, {
			cwd: tempDir,
			readLedger: ledger,
		} as any);

		expect(result.details?.readLedger?.repeatedRead).toBe(true);
		expect(result.details?.readLedger?.previousHash).toBe("previous-hash");
		expect(text(result)).toContain("[Read hint: this file was already read earlier in this session");
	});
});
