import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createAstGrepTool } from "../src/core/tools/ast-grep.js";
import type { AstBackend } from "../src/core/tools/ast/index.js";

function getTextOutput(result: any): string {
	return result.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") || "";
}

describe("ast_grep tool", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ast-grep-tool-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		writeFileSync(join(testDir, "sample.ts"), "function foo() {\n  return 1;\n}\nfoo();\n");
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test("formats grouped hashline-style results from backend matches", async () => {
		const backend: AstBackend = {
			async run() {
				return {
					matches: [
						{
							text: "foo()",
							lines: "foo()",
							file: "sample.ts",
							range: {
								byteOffset: { start: 31, end: 36 },
								start: { line: 3, column: 0 },
								end: { line: 3, column: 5 },
							},
							metaVariables: { single: { A: { text: "1" } }, multi: {}, transformed: {} },
						},
					],
					stderr: "",
				};
			},
		};
		const tool = createAstGrepTool(testDir, { backend });
		const result = await tool.execute("call-1", { pat: ["foo()"], path: testDir, context: 0 });
		const text = getTextOutput(result);
		expect(text).toContain("# sample.ts");
		expect(text).toContain(":foo()");
		expect(result.details?.matchCount).toBe(1);
	});
});
