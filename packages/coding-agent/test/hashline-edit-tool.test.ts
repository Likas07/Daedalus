import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { computeLineHash, HashlineMismatchError } from "../src/core/tools/hashline/index.js";
import { createHashlineEditToolDefinition } from "../src/core/tools/hashline-edit.js";
import { allTools, codingTools } from "../src/core/tools/index.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "dae-hashline-edit-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("hashline_edit tool", () => {
	test("applies anchored range replacement", async () => {
		const dir = await createTempDir();
		const filePath = join(dir, "file.ts");
		await writeFile(filePath, "function a() {\n  old();\n}\n", "utf8");
		const tool = createHashlineEditToolDefinition(dir);
		const result = await tool.execute(
			"tool-1",
			{
				edits: [
					{
						path: "file.ts",
						op: "replace",
						pos: `2#${computeLineHash(2, "  old();")}`,
						lines: ["  next();"],
					},
				],
			},
			undefined,
			undefined,
			{} as any,
		);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("Updated file.ts");
		expect(await readFile(filePath, "utf8")).toBe("function a() {\n  next();\n}\n");
		expect(result.details?.diff).toContain("next();");
	});

	test("applies bulk edits across multiple files", async () => {
		const dir = await createTempDir();
		await writeFile(join(dir, "a.txt"), "one\ntwo\n", "utf8");
		await writeFile(join(dir, "b.txt"), "alpha\nbeta\n", "utf8");
		const tool = createHashlineEditToolDefinition(dir);

		const result = await tool.execute(
			"tool-bulk",
			{
				edits: [
					{ path: "a.txt", op: "replace", pos: `2#${computeLineHash(2, "two")}`, lines: ["TWO"] },
					{ path: "b.txt", op: "append", pos: `1#${computeLineHash(1, "alpha")}`, lines: ["inserted"] },
				],
			},
			undefined,
			undefined,
			{} as any,
		);

		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("Updated a.txt");
		expect(text).toContain("Updated b.txt");
		expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("one\nTWO\n");
		expect(await readFile(join(dir, "b.txt"), "utf8")).toBe("alpha\ninserted\nbeta\n");
		expect(result.details?.diff).toContain("TWO");
		expect(result.details?.diff).toContain("inserted");
	});

	test("creates missing files from anchorless append or prepend", async () => {
		const dir = await createTempDir();
		const tool = createHashlineEditToolDefinition(dir);

		await tool.execute(
			"tool-create",
			{ edits: [{ path: "new.txt", op: "append", lines: ["hello", "world"] }] },
			undefined,
			undefined,
			{} as any,
		);

		expect(await readFile(join(dir, "new.txt"), "utf8")).toBe("hello\nworld");
	});

	test("deletes and moves files", async () => {
		const dir = await createTempDir();
		await writeFile(join(dir, "dead.txt"), "remove me", "utf8");
		await writeFile(join(dir, "old.txt"), "keep me", "utf8");
		const tool = createHashlineEditToolDefinition(dir);

		const result = await tool.execute(
			"tool-file-ops",
			{ edits: [{ path: "dead.txt", op: "delete" }, { path: "old.txt", op: "move", to: "nested/new.txt" }] },
			undefined,
			undefined,
			{} as any,
		);

		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("Deleted dead.txt");
		expect(text).toContain("Moved old.txt to nested/new.txt");
		await expect(readFile(join(dir, "dead.txt"), "utf8")).rejects.toThrow();
		await expect(readFile(join(dir, "old.txt"), "utf8")).rejects.toThrow();
		expect(await readFile(join(dir, "nested/new.txt"), "utf8")).toBe("keep me");
	});

	test("rejects legacy top-level path shape", async () => {
		const dir = await createTempDir();
		await writeFile(join(dir, "file.txt"), "alpha\n", "utf8");
		const tool = createHashlineEditToolDefinition(dir);

		await expect(
			tool.execute(
				"tool-legacy",
				{ path: "file.txt", edits: [{ loc: "append", content: ["beta"] }] } as never,
				undefined,
				undefined,
				{} as any,
			),
		).rejects.toThrow(/hashline_edit now expects/);
	});

	test("fails on stale anchor without changing file", async () => {
		const dir = await createTempDir();
		const filePath = join(dir, "file.txt");
		await writeFile(filePath, "alpha\nbeta\n", "utf8");
		const tool = createHashlineEditToolDefinition(dir);
		await expect(
			tool.execute(
				"tool-2",
				{ edits: [{ path: "file.txt", op: "replace", pos: "2#ZZ", lines: ["BETA"] }] },
				undefined,
				undefined,
				{} as any,
			),
		).rejects.toBeInstanceOf(HashlineMismatchError);

		expect(await readFile(filePath, "utf8")).toBe("alpha\nbeta\n");
	});

	test("preserves BOM and CRLF", async () => {
		const dir = await createTempDir();
		const filePath = join(dir, "file.txt");
		await writeFile(filePath, "\uFEFFfirst\r\nsecond\r\n", "utf8");
		const tool = createHashlineEditToolDefinition(dir);
		await tool.execute(
			"tool-3",
			{ edits: [{ path: "file.txt", op: "replace", pos: `2#${computeLineHash(2, "second")}`, lines: ["SECOND"] }] },
			undefined,
			undefined,
			{} as any,
		);
		expect(await readFile(filePath, "utf8")).toBe("\uFEFFfirst\r\nSECOND\r\n");
	});

	test("registers hashline_edit as default coding tool and keeps exact edit available", () => {
		expect(allTools).toHaveProperty("hashline_edit");
		expect(allTools).toHaveProperty("edit");
		expect(codingTools.map((tool) => tool.name)).toContain("hashline_edit");
		expect(codingTools.map((tool) => tool.name)).not.toContain("edit");
	});
});
