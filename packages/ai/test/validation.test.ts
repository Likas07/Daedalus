import { Type } from "@sinclair/typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolCall } from "../src/types.js";
import { TOOL_ARGUMENT_REPAIR_SYMBOL, validateToolArguments } from "../src/utils/validation.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("validateToolArguments", () => {
	it("parses stringified JSON objects before validation", () => {
		const tool = {
			name: "echo",
			description: "Echo tool",
			parameters: Type.Object({
				count: Type.Number(),
				label: Type.String(),
			}),
		};
		const toolCall: ToolCall = {
			type: "toolCall",
			id: "tool-json-1",
			name: "echo",
			arguments: '{"count":"42","label":"hello"}' as unknown as Record<string, any>,
		};

		const result = validateToolArguments(tool, toolCall);

		expect(result).toEqual({ count: 42, label: "hello" });
		expect(result[TOOL_ARGUMENT_REPAIR_SYMBOL]).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "parsed_json_string" })]),
		);
	});

	it("recovers partial JSON strings before validation", () => {
		const tool = {
			name: "echo",
			description: "Echo tool",
			parameters: Type.Object({
				action: Type.String(),
			}),
		};
		const toolCall: ToolCall = {
			type: "toolCall",
			id: "tool-json-2",
			name: "echo",
			arguments: '{"action":"list"' as unknown as Record<string, any>,
		};

		const result = validateToolArguments(tool, toolCall);

		expect(result).toEqual({ action: "list" });
		expect(result[TOOL_ARGUMENT_REPAIR_SYMBOL]).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "parsed_partial_json_string" })]),
		);
	});

	it("normalizes enum casing when there is a unique case-insensitive match", () => {
		const tool = {
			name: "todo_write",
			description: "Todo tool",
			parameters: Type.Object({
				status: Type.Union([Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("completed")]),
			}),
		};
		const toolCall: ToolCall = {
			type: "toolCall",
			id: "tool-enum-1",
			name: "todo_write",
			arguments: { status: "COMPLETED" },
		};

		const result = validateToolArguments(tool, toolCall);

		expect(result).toEqual({ status: "completed" });
		expect(result[TOOL_ARGUMENT_REPAIR_SYMBOL]).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "normalized_enum_case", path: "/status" })]),
		);
	});

	it("wraps singleton values for array fields when the schema expects an array", () => {
		const tool = {
			name: "patch",
			description: "Patch tool",
			parameters: Type.Object({
				edits: Type.Array(
					Type.Object({
						oldText: Type.String(),
						newText: Type.String(),
					}),
				),
			}),
		};
		const toolCall: ToolCall = {
			type: "toolCall",
			id: "tool-array-1",
			name: "patch",
			arguments: {
				edits: {
					oldText: "before",
					newText: "after",
				},
			},
		};

		const result = validateToolArguments(tool, toolCall);

		expect(result).toEqual({ edits: [{ oldText: "before", newText: "after" }] });
		expect(result[TOOL_ARGUMENT_REPAIR_SYMBOL]).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "wrapped_singleton_array", path: "/edits" })]),
		);
	});

	it("falls back to raw arguments without writing to stderr when runtime code generation is blocked", () => {
		const originalFunction = globalThis.Function;
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const tool = {
			name: "echo",
			description: "Echo tool",
			parameters: Type.Object({
				count: Type.Number(),
			}),
		};
		const toolCall: ToolCall = {
			type: "toolCall",
			id: "tool-1",
			name: "echo",
			arguments: { count: "42" as unknown as number },
		};

		globalThis.Function = (() => {
			throw new EvalError("Code generation from strings disallowed for this context");
		}) as unknown as FunctionConstructor;

		try {
			expect(validateToolArguments(tool, toolCall)).toEqual(toolCall.arguments);
			expect(errorSpy).not.toHaveBeenCalled();
		} finally {
			globalThis.Function = originalFunction;
		}
	});
});
