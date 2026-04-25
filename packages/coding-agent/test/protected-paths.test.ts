import { describe, expect, it } from "vitest";
import protectedPaths from "../src/extensions/daedalus/safety/protected-paths.js";
import { isProtectedPath } from "../src/extensions/daedalus/shared/guards.js";

function registerProtectedPathHandler() {
	let handler: ((event: any, ctx: any) => Promise<unknown>) | undefined;
	protectedPaths({
		on(event: string, nextHandler: any) {
			if (event === "tool_call") handler = nextHandler;
		},
	} as any);
	if (!handler) throw new Error("protected-paths did not register a tool_call handler");
	return handler;
}

describe("protected path safety", () => {
	it("hardens isProtectedPath against non-string input", () => {
		expect(isProtectedPath(undefined)).toBe(false);
		expect(isProtectedPath(null)).toBe(false);
		expect(isProtectedPath({ path: ".env" })).toBe(false);
		expect(isProtectedPath("config/.env.local")).toBe(true);
	});

	it("blocks traditional top-level mutation paths", async () => {
		const handler = registerProtectedPathHandler();
		const result = await handler(
			{ type: "tool_call", toolCallId: "1", toolName: "write", input: { path: ".env" } },
			{ hasUI: false },
		);

		expect(result).toEqual({ block: true, reason: 'Path ".env" is protected' });
	});

	it("allows safe hashline_edit bulk paths without crashing", async () => {
		const handler = registerProtectedPathHandler();
		const result = await handler(
			{
				type: "tool_call",
				toolCallId: "1",
				toolName: "hashline_edit",
				input: { edits: [{ path: "src/file.ts", op: "replace", pos: "1#AA", lines: ["next"] }] },
			},
			{ hasUI: false },
		);

		expect(result).toBeUndefined();
	});

	it("blocks protected hashline_edit source and destination paths", async () => {
		const handler = registerProtectedPathHandler();

		await expect(
			handler(
				{
					type: "tool_call",
					toolCallId: "1",
					toolName: "hashline_edit",
					input: { edits: [{ path: "node_modules/pkg/index.js", op: "replace", pos: "1#AA", lines: ["next"] }] },
				},
				{ hasUI: false },
			),
		).resolves.toEqual({ block: true, reason: 'Path "node_modules/pkg/index.js" is protected' });

		await expect(
			handler(
				{
					type: "tool_call",
					toolCallId: "2",
					toolName: "hashline_edit",
					input: { edits: [{ path: "safe.txt", op: "move", to: ".git/config" }] },
				},
				{ hasUI: false },
			),
		).resolves.toEqual({ block: true, reason: 'Path ".git/config" is protected' });
	});
});
