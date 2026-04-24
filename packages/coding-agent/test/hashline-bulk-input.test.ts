import { describe, expect, test } from "vitest";
import { normalizeHashlineBulkInput } from "../src/core/tools/hashline/index.js";

describe("hashline bulk input normalization", () => {
	test("normalizes replace/append/prepend entries grouped by path", () => {
		const grouped = normalizeHashlineBulkInput({
			edits: [
				{ path: "src/a.ts", op: "replace", pos: "2#VK", end: "4#MB", lines: ["next();"] },
				{ path: "src/a.ts", op: "append", pos: "8#QR", lines: ["after();"] },
				{ path: "src/b.ts", op: "prepend", lines: "header\n" },
			],
		});

		expect([...grouped.keys()]).toEqual(["src/a.ts", "src/b.ts"]);
		expect(grouped.get("src/a.ts")?.contentEdits).toEqual([
			{ op: "replace_range", pos: { line: 2, hash: "VK" }, end: { line: 4, hash: "MB" }, lines: ["next();"] },
			{ op: "append_at", pos: { line: 8, hash: "QR" }, lines: ["after();"] },
		]);
		expect(grouped.get("src/b.ts")?.contentEdits).toEqual([{ op: "prepend_file", lines: ["header"] }]);
	});

	test("normalizes replace without end as single-line replacement", () => {
		const grouped = normalizeHashlineBulkInput({
			edits: [{ path: "file.txt", op: "replace", pos: "3#TN", lines: "THREE" }],
		});

		expect(grouped.get("file.txt")?.contentEdits).toEqual([
			{ op: "replace_line", pos: { line: 3, hash: "TN" }, lines: ["THREE"] },
		]);
	});

	test("normalizes replace with null lines as delete range", () => {
		const grouped = normalizeHashlineBulkInput({
			edits: [{ path: "file.txt", op: "replace", pos: "2#VK", end: "5#WS", lines: null }],
		});

		expect(grouped.get("file.txt")?.contentEdits).toEqual([
			{ op: "replace_range", pos: { line: 2, hash: "VK" }, end: { line: 5, hash: "WS" }, lines: [] },
		]);
	});

	test("normalizes delete and move file modes", () => {
		const grouped = normalizeHashlineBulkInput({
			edits: [
				{ path: "dead.ts", op: "delete" },
				{ path: "old.ts", op: "move", to: "new.ts" },
			],
		});

		expect(grouped.get("dead.ts")?.fileOps).toEqual([{ op: "delete" }]);
		expect(grouped.get("old.ts")?.fileOps).toEqual([{ op: "move", to: "new.ts" }]);
	});

	test("rejects removed loc/content shape", () => {
		expect(() =>
			normalizeHashlineBulkInput({
				path: "file.ts",
				edits: [{ loc: "append", content: ["x"] }],
			} as never),
		).toThrow(/hashline_edit now expects/);
	});

	test("rejects append and prepend with null lines", () => {
		expect(() =>
			normalizeHashlineBulkInput({ edits: [{ path: "file.ts", op: "append", lines: null }] } as never),
		).toThrow(/append requires non-null lines/);
		expect(() =>
			normalizeHashlineBulkInput({ edits: [{ path: "file.ts", op: "prepend", lines: null }] } as never),
		).toThrow(/prepend requires non-null lines/);
	});
});
