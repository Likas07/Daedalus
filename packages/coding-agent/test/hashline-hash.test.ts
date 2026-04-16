import { describe, expect, test } from "vitest";
import { computeLineHash, formatHashLines, formatLineTag } from "../src/core/tools/hashline/index.js";

describe("hashline hash computation", () => {
	test("produces deterministic 2-char hash", () => {
		const hash1 = computeLineHash(1, "function hello() {");
		const hash2 = computeLineHash(1, "function hello() {");
		expect(hash1).toBe(hash2);
		expect(hash1).toMatch(/^[ZPMQVRWSNKTXJBYH]{2}$/);
	});

	test("keeps same hash for significant content on different lines", () => {
		expect(computeLineHash(1, "const x = 1;")).toBe(computeLineHash(2, "const x = 1;"));
	});

	test("mixes line number for symbol-only lines", () => {
		expect(computeLineHash(1, "}")).not.toBe(computeLineHash(2, "}"));
	});

	test("ignores trailing whitespace and CR characters", () => {
		expect(computeLineHash(1, "hello  ")).toBe(computeLineHash(1, "hello\r"));
	});

	test("formats tags and hashline output", () => {
		const tag = formatLineTag(4, "line");
		expect(tag).toMatch(/^4#[ZPMQVRWSNKTXJBYH]{2}$/);
		expect(formatHashLines("a\nb", 10)).toMatch(/^10#[ZPMQVRWSNKTXJBYH]{2}:a\n11#[ZPMQVRWSNKTXJBYH]{2}:b$/);
	});
});
