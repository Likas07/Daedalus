import { describe, expect, it } from "bun:test";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEditToolDefinition } from "../../src/core/tools/edit.js";
import { createHashlineEditToolDefinition } from "../../src/core/tools/hashline-edit.js";
import { ReadLedger } from "../../src/core/tools/read-ledger.js";
import { createWriteToolDefinition } from "../../src/core/tools/write.js";

function errorText(result: any): string {
	return result.content[0].text;
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("read-before-edit enforcement", () => {
	it("edit errors without prior read and succeeds after read", async () => {
		const dir = await mkdtemp(join(tmpdir(), "read-ledger-edit-"));
		const file = join(dir, "a.txt");
		await writeFile(file, "hello\n", "utf-8");
		const ledger = new ReadLedger(dir);
		const tool = createEditToolDefinition(dir, { readLedger: ledger });

		const blocked = await tool.execute(
			"tc",
			{ path: "a.txt", edits: [{ oldText: "hello", newText: "hi" }] },
			undefined,
			undefined,
			undefined as any,
		);
		expect(blocked.isError).toBe(true);
		expect(errorText(blocked)).toBe("You must read the file with the read tool before attempting to edit.");

		ledger.markRead(file);
		const ok = await tool.execute(
			"tc",
			{ path: "a.txt", edits: [{ oldText: "hello", newText: "hi" }] },
			undefined,
			undefined,
			undefined as any,
		);
		expect(ok.isError).not.toBe(true);
		expect(await readFile(file, "utf-8")).toBe("hi\n");
	});

	it("hashline_edit errors without prior read", async () => {
		const dir = await mkdtemp(join(tmpdir(), "read-ledger-hashline-"));
		const file = join(dir, "a.txt");
		await writeFile(file, "hello\n", "utf-8");
		const tool = createHashlineEditToolDefinition(dir, { readLedger: new ReadLedger(dir) });
		const result = await tool.execute(
			"tc",
			{ path: "a.txt", edits: [{ loc: "append", content: ["x"] }] },
			undefined,
			undefined,
			undefined as any,
		);
		expect(result.isError).toBe(true);
		expect(errorText(result)).toBe("You must read the file with the read tool before attempting to hashline_edit.");
	});

	it("write permits new files but requires prior read for overwrites", async () => {
		const dir = await mkdtemp(join(tmpdir(), "read-ledger-write-"));
		const ledger = new ReadLedger(dir);
		const tool = createWriteToolDefinition(dir, { readLedger: ledger });

		const created = await tool.execute(
			"tc",
			{ path: "new.txt", content: "new" },
			undefined,
			undefined,
			undefined as any,
		);
		expect(created.isError).not.toBe(true);

		const blocked = await tool.execute(
			"tc",
			{ path: "new.txt", content: "overwrite" },
			undefined,
			undefined,
			undefined as any,
		);
		expect(blocked.isError).toBe(true);
		expect(errorText(blocked)).toBe("You must read the file with the read tool before attempting to write.");

		ledger.markRead(join(dir, "new.txt"));
		const ok = await tool.execute(
			"tc",
			{ path: "new.txt", content: "overwrite" },
			undefined,
			undefined,
			undefined as any,
		);
		expect(ok.isError).not.toBe(true);
		expect(await readFile(join(dir, "new.txt"), "utf-8")).toBe("overwrite");
	});

	it("write checks overwrite status inside the mutation queue for concurrent new-file writes", async () => {
		const dir = await mkdtemp(join(tmpdir(), "read-ledger-write-race-"));
		const ledger = new ReadLedger(dir);
		const tool = createWriteToolDefinition(dir, {
			readLedger: ledger,
			operations: {
				mkdir: async () => {},
				writeFile,
				async exists(path) {
					// If write checks happen before queueing, both concurrent calls observe the path as missing.
					await sleep(10);
					return access(path).then(
						() => true,
						() => false,
					);
				},
			},
		});

		const first = tool.execute(
			"tc-1",
			{ path: "race.txt", content: "first" },
			undefined,
			undefined,
			undefined as any,
		);
		const second = tool.execute(
			"tc-2",
			{ path: "race.txt", content: "second" },
			undefined,
			undefined,
			undefined as any,
		);
		const results = await Promise.all([first, second]);

		expect(results.filter((result) => result.isError === true)).toHaveLength(1);
		expect(results.filter((result) => result.isError !== true)).toHaveLength(1);
		expect(results.find((result) => result.isError === true)?.content[0].text).toBe(
			"You must read the file with the read tool before attempting to write.",
		);
		expect(await readFile(join(dir, "race.txt"), "utf-8")).toBe("first");
	});
});
