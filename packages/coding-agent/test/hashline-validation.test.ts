import { describe, expect, test } from "vitest";
import {
	computeLineHash,
	HashlineMismatchError,
	parseTag,
	validateTag,
	validateTags,
} from "../src/core/tools/hashline/index.js";

describe("hashline validation", () => {
	test("parses copied display refs", () => {
		expect(parseTag("5#ZZ")).toEqual({ line: 5, hash: "ZZ" });
		expect(parseTag(">>> 5 # ZZ:hello")).toEqual({ line: 5, hash: "ZZ" });
	});

	test("rejects invalid refs", () => {
		expect(() => parseTag("line five")).toThrow(/Invalid line reference/);
	});

	test("validates matching anchor", () => {
		const lines = ["aaa", "bbb"];
		expect(() => validateTag({ line: 2, hash: computeLineHash(2, "bbb") }, lines)).not.toThrow();
	});

	test("throws mismatch error with context", () => {
		const lines = ["aaa", "bbb", "ccc"];
		try {
			validateTag({ line: 2, hash: "ZZ" }, lines);
			expect.unreachable("should throw");
		} catch (error) {
			expect(error).toBeInstanceOf(HashlineMismatchError);
			const message = (error as HashlineMismatchError).message;
			expect(message).toContain(">>>");
			expect(message).toContain(`2#${computeLineHash(2, "bbb")}:bbb`);
		}
	});

	test("aggregates multiple mismatches", () => {
		const lines = ["aaa", "bbb", "ccc", "ddd"];
		try {
			validateTags(
				[
					{ line: 2, hash: "ZZ" },
					{ line: 4, hash: "ZZ" },
				],
				lines,
			);
			expect.unreachable("should throw");
		} catch (error) {
			expect(error).toBeInstanceOf(HashlineMismatchError);
			const mismatch = error as HashlineMismatchError;
			expect(mismatch.mismatches).toHaveLength(2);
		}
	});
});
