import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const matrixPath = resolve(import.meta.dir, "../../../../docs/gui/parity-matrix.md");
const matrix = readFileSync(matrixPath, "utf8");
const rows = matrix.split("\n").filter((line) => /^\| [^|]+ \| (wired|partial|disabled|unsupported) \|/.test(line));

describe("GUI parity matrix release gate", () => {
	test("contains only triaged statuses with explicit reasons for incomplete surfaces", () => {
		expect(rows.length).toBeGreaterThan(0);
		const missingReasons = rows.filter((row) => {
			const [, surface, status, contract] = row.split("|").map((part) => part.trim());
			return surface !== "Surface" && ["partial", "disabled", "unsupported"].includes(status) && contract.length < 12;
		});
		expect(missingReasons).toEqual([]);
	});

	test("does not contain untriaged placeholder or no-op entries", () => {
		const forbidden = /\b(?:placeholder|no-op|noop|stub|dummy|tbd|unknown|untriaged)\b/i;
		const offenders = rows
			.map((line, index) => ({ line, number: index + 1 }))
			.filter(({ line }) => forbidden.test(line));
		expect(offenders).toEqual([]);
	});
});
