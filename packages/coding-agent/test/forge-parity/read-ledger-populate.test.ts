import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadToolDefinition } from "../../src/core/tools/read.js";
import { ReadLedger } from "../../src/core/tools/read-ledger.js";

describe("read ledger population", () => {
	it("read tool marks successful reads and records content hash", async () => {
		const dir = await mkdtemp(join(tmpdir(), "read-ledger-populate-"));
		const file = join(dir, "a.txt");
		await writeFile(file, "hello", "utf-8");
		const ledger = new ReadLedger(dir);
		const tool = createReadToolDefinition(dir);

		const result = await tool.execute("tc", { path: "a.txt", format: "plain" }, undefined, undefined, {
			readLedger: ledger,
		} as any);

		expect(result.isError).not.toBe(true);
		expect(ledger.hasRead(file)).toBe(true);
		expect(typeof ledger.getHash(file)).toBe("string");
		expect((result.details as any).absolutePath).toBe(file);
	});
});
