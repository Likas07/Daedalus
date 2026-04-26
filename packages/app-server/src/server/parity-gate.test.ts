import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type MatrixStatus = "wired" | "partial" | "disabled";

interface MatrixRow {
	readonly surface: string;
	readonly required: boolean;
	readonly status: MatrixStatus;
	readonly coverage: string;
	readonly contract: string;
	readonly lineNumber: number;
}

const REQUIRED_SURFACES = [
	"Composer",
	"Project/session",
	"Provider/model/auth",
	"Terminal",
	"Git/diff/checkpoint/PR",
	"Settings",
	"Persistence",
	"Workflow/inspector",
	"Desktop-native behavior",
	"E2E",
] as const;

const matrixPath = resolve(import.meta.dir, "../../../../docs/gui/parity-matrix.md");
const matrix = readFileSync(matrixPath, "utf8");
const rows = parseMatrixRows(matrix);
const matrixDataLines = matrix.split("\n").filter(isMatrixDataLine);
const strictFullParityMode = process.env.STRICT_GUI_FULL_PARITY === "1";

describe("GUI parity matrix release gate", () => {
	test("contains only triaged statuses with explicit reasons for incomplete surfaces", () => {
		expect(rows.length).toBeGreaterThan(0);
		expect(rows).toHaveLength(matrixDataLines.length);
		const missingReasons = rows.filter((row) => row.status !== "wired" && row.contract.length < 12);
		expect(missingReasons).toEqual([]);
	});

	test("declares every required full-parity surface with behavioral coverage", () => {
		expect(rows.filter((row) => row.required).map((row) => row.surface)).toEqual([...REQUIRED_SURFACES]);
		const missingCoverage = rows.filter((row) => row.required && behavioralCoverageReferences(row).length === 0);
		expect(missingCoverage).toEqual([]);
	});

	test("strict gate accepts only wired required surfaces with behavioral coverage", () => {
		const wiredFixture = REQUIRED_SURFACES.map(
			(surface, index): MatrixRow => ({
				surface,
				required: true,
				status: "wired",
				coverage: index % 2 === 0 ? "packages/gui/src/app.test.ts" : "packages/gui/test/e2e/web-gui-smoke.test.ts",
				contract: "Behavioral coverage proves the full parity contract for this surface.",
				lineNumber: index + 1,
			}),
		);
		expect(strictMatrixViolations(wiredFixture)).toEqual([]);

		const partialFixture = wiredFixture.map((row) =>
			row.surface === "Composer" ? { ...row, status: "partial" as const } : row,
		);
		expect(strictMatrixViolations(partialFixture)).toContainEqual(expect.stringContaining("Composer must be wired"));

		const sourceOnlyFixture = wiredFixture.map((row) =>
			row.surface === "Workflow/inspector"
				? { ...row, coverage: "packages/gui/src/components/InspectorPanel.svelte" }
				: row,
		);
		expect(strictMatrixViolations(sourceOnlyFixture)).toContainEqual(
			expect.stringContaining("Workflow/inspector must reference behavioral tests"),
		);
	});

	test("strict full-parity mode fails only the full gate while focused gate tests stay green", () => {
		const violations = strictMatrixViolations(rows);
		if (strictFullParityMode) {
			expect(violations).toEqual([]);
			return;
		}

		const requiredStatusViolations = violations.filter((violation) => violation.includes("must be wired"));
		const incompleteRequiredRows = rows.filter((row) => row.required && row.status !== "wired");
		expect(requiredStatusViolations).toHaveLength(incompleteRequiredRows.length);
	});

	test("does not contain forbidden placeholder, no-op, or fixture-only matrix entries", () => {
		const offenders = rows
			.map((row) => ({ row, lineNumber: row.lineNumber }))
			.filter(({ row }) => hasForbiddenMatrixCopy(row));
		expect(offenders).toEqual([]);
	});
});

function isMatrixDataLine(line: string): boolean {
	return line.startsWith("|") && !line.includes("---") && !line.includes("Surface | Required");
}

function parseMatrixRows(markdown: string): readonly MatrixRow[] {
	return markdown
		.split("\n")
		.map((line, index) => ({ line, lineNumber: index + 1 }))
		.flatMap(({ line, lineNumber }) => {
			if (!isMatrixDataLine(line)) return [];
			const cells = line
				.split("|")
				.slice(1, -1)
				.map((cell) => cell.trim());
			if (cells.length !== 5) return [];
			const [surface, required, status, coverage, contract] = cells;
			if (!isMatrixStatus(status)) return [];
			return [{ surface, required: required === "yes", status, coverage, contract, lineNumber }];
		});
}

function strictMatrixViolations(matrixRows: readonly MatrixRow[]): readonly string[] {
	const violations: string[] = [];
	const surfaces = new Set(matrixRows.map((row) => row.surface));
	for (const surface of REQUIRED_SURFACES) {
		if (!surfaces.has(surface)) violations.push(`${surface} is missing from the GUI parity matrix.`);
	}

	for (const row of matrixRows) {
		if (hasForbiddenMatrixCopy(row)) violations.push(`${row.surface} uses forbidden parity-gate copy.`);
		if (!row.required) continue;
		if (row.status !== "wired")
			violations.push(`${row.surface} must be wired for strict GUI full parity, not ${row.status}.`);
		const coverageReferences = behavioralCoverageReferences(row);
		if (coverageReferences.length === 0) violations.push(`${row.surface} must reference behavioral tests.`);
		if (coverageReferences.some((reference) => !isBehavioralCoverageReference(reference))) {
			violations.push(`${row.surface} must reference behavioral tests, not source strings or fixture-only checks.`);
		}
	}
	return violations;
}

function behavioralCoverageReferences(row: MatrixRow): readonly string[] {
	if (row.coverage === "—") return [];
	return row.coverage
		.split(";")
		.map((reference) => reference.trim())
		.filter(Boolean);
}

function hasForbiddenMatrixCopy(row: MatrixRow): boolean {
	return /\b(?:placeholder|no-op|noop|stub|dummy|fixture-only|tbd|unknown|untriaged)\b/i.test(
		[row.surface, row.coverage, row.contract].join("\n"),
	);
}

function isBehavioralCoverageReference(reference: string): boolean {
	return /\.test\.ts$/.test(reference) && !/\b(?:source-string|readFileSync|fixture-only)\b/i.test(reference);
}

function isMatrixStatus(status: string): status is MatrixStatus {
	return status === "wired" || status === "partial" || status === "disabled";
}
