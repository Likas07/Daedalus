import { describe, expect, it } from "vitest";
import { type BashOperations, createBashToolDefinition } from "../../src/core/tools/bash.js";

function text(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.map((entry) => entry.text ?? "").join("\n");
}

describe("bash prefix+suffix truncation", () => {
	it("shows first and last lines when stdout exceeds the configured visible window", async () => {
		const output = Array.from({ length: 500 }, (_, index) => `Line ${index + 1}`).join("\n");
		const operations: BashOperations = {
			exec: async (_command, _cwd, options) => {
				options.onData(Buffer.from(output, "utf8"));
				options.onStdout?.(Buffer.from(output, "utf8"));
				return { exitCode: 0 };
			},
		};
		const tool = createBashToolDefinition(process.cwd(), {
			operations,
			toolOutputs: { maxStdoutPrefixLines: 5, maxStdoutSuffixLines: 5 },
		});

		const result = await tool.execute("bash-lines", { command: "generate" }, undefined, undefined, {} as any);
		const outputText = text(result);

		expect(outputText).toContain("Line 1");
		expect(outputText).toContain("Line 5");
		expect(outputText).toContain("Line 496");
		expect(outputText).toContain("Line 500");
		expect(outputText).toContain("omitted 490 middle lines");
		expect(outputText).not.toContain("Line 250");
	});
});
