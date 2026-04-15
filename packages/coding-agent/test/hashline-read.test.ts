import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createReadToolDefinition } from "../src/core/tools/read.js";
import { computeLineHash } from "../src/core/tools/hashline/index.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "dae-hashline-read-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("read hashline mode", () => {
	test("returns LINE#ID output", async () => {
		const dir = await createTempDir();
		await writeFile(join(dir, "file.txt"), "alpha\nbeta\n", "utf8");
		const tool = createReadToolDefinition(dir);
		const result = await tool.execute("tool-1", { path: "file.txt", format: "hashline" });
		const text = result.content[0]?.type === "text" ? result.content[0].text ?? "" : "";
		expect(text).toContain(`1#${computeLineHash(1, "alpha")}:alpha`);
		expect(text).toContain(`2#${computeLineHash(2, "beta")}:beta`);
	});

	test("keeps real line numbers with offset and limit", async () => {
		const dir = await createTempDir();
		await writeFile(join(dir, "file.txt"), "one\ntwo\nthree\nfour\n", "utf8");
		const tool = createReadToolDefinition(dir);
		const result = await tool.execute("tool-2", { path: "file.txt", offset: 2, limit: 2, format: "hashline" });
		const text = result.content[0]?.type === "text" ? result.content[0].text ?? "" : "";
		expect(text).toContain(`2#${computeLineHash(2, "two")}:two`);
		expect(text).toContain(`3#${computeLineHash(3, "three")}:three`);
		expect(text).toContain("Use offset=4 to continue");
	});
});
