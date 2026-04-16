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
				path: "file.ts",
				edits: [
					{
						loc: {
							range: {
								pos: `2#${computeLineHash(2, "  old();")}`,
								end: `2#${computeLineHash(2, "  old();")}`,
							},
						},
						content: ["  next();"],
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

	test("fails on stale anchor without changing file", async () => {
		const dir = await createTempDir();
		const filePath = join(dir, "file.txt");
		await writeFile(filePath, "alpha\nbeta\n", "utf8");
		const tool = createHashlineEditToolDefinition(dir);
		await expect(
			tool.execute(
				"tool-2",
				{
					path: "file.txt",
					edits: [
						{
							loc: { range: { pos: "2#ZZ", end: "2#ZZ" } },
							content: ["BETA"],
						},
					],
				},
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
			{
				path: "file.txt",
				edits: [
					{
						loc: {
							range: {
								pos: `2#${computeLineHash(2, "second")}`,
								end: `2#${computeLineHash(2, "second")}`,
							},
						},
						content: ["SECOND"],
					},
				],
			},
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
