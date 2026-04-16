import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { AstBackend } from "../src/core/tools/ast/index.js";
import { createAstEditTool } from "../src/core/tools/ast-edit.js";
import { allTools, codingTools } from "../src/core/tools/index.js";

function getTextOutput(result: any): string {
	return (
		result.content
			?.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n") || ""
	);
}

describe("ast_edit tool", () => {
	let testDir: string;
	let testFile: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ast-edit-tool-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		testFile = join(testDir, "sample.ts");
		writeFileSync(testFile, "\ufeffconst foo = 1;\r\nconsole.log(foo);\r\n", "utf-8");
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test("applies structural replacement and preserves BOM/CRLF", async () => {
		const backend: AstBackend = {
			async run() {
				return {
					matches: [
						{
							text: "console.log(foo)",
							lines: "console.log(foo)",
							file: "sample.ts",
							range: {
								byteOffset: { start: 15, end: 31 },
								start: { line: 1, column: 0 },
								end: { line: 1, column: 16 },
							},
							replacement: "logger.info(foo)",
						},
					],
					stderr: "",
				};
			},
		};
		const tool = createAstEditTool(testDir, { backend });
		const result = await tool.execute("call-1", {
			ops: [{ pat: "console.log($A)", out: "logger.info($A)" }],
			path: testFile,
		});
		expect(getTextOutput(result)).toContain("sample.ts");
		const finalText = readFileSync(testFile, "utf-8");
		expect(finalText.startsWith("\ufeff")).toBe(true);
		expect(finalText).toContain("logger.info(foo);");
		expect(finalText).toContain("\r\n");
		const raw = readFileSync(testFile);
		expect(raw[0]).toBe(0xef);
		expect(raw[1]).toBe(0xbb);
		expect(raw[2]).toBe(0xbf);
	});

	test("registers AST tools in default codingTools", () => {
		expect(allTools).toHaveProperty("ast_grep");
		expect(allTools).toHaveProperty("ast_edit");
		expect(codingTools.map((tool) => tool.name)).toContain("ast_grep");
		expect(codingTools.map((tool) => tool.name)).toContain("ast_edit");
	});
});
