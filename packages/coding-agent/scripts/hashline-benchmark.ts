import { performance } from "node:perf_hooks";
import { applyEditsToNormalizedContent } from "../src/core/tools/edit-diff.js";
import {
	applyHashlineEditsToNormalizedContent,
	formatLineTag,
	parseTag,
	type HashlineEditOperation,
} from "../src/core/tools/hashline/index.js";

interface BenchmarkCase {
	name: string;
	content: string;
	exact?: { oldText: string; newText: string }[];
	hashline?: HashlineEditOperation[];
	expectExactSuccess: boolean;
	expectHashlineSuccess: boolean;
}

function tag(line: number, content: string) {
	return parseTag(formatLineTag(line, content));
}

const cases: BenchmarkCase[] = [
	{
		name: "unique line replace",
		content: "alpha\nbeta\ngamma\n",
		exact: [{ oldText: "beta\n", newText: "BETA\n" }],
		hashline: [{ op: "replace_line", pos: tag(2, "beta"), lines: ["BETA"] }],
		expectExactSuccess: true,
		expectHashlineSuccess: true,
	},
	{
		name: "duplicate text exact fails, hashline succeeds",
		content: "dup\nmid\ndup\n",
		exact: [{ oldText: "dup\n", newText: "DUP\n" }],
		hashline: [{ op: "replace_line", pos: tag(3, "dup"), lines: ["DUP"] }],
		expectExactSuccess: false,
		expectHashlineSuccess: true,
	},
	{
		name: "multi-edit original snapshot",
		content: "one\ntwo\nthree\nfour\nfive\n",
		exact: [
			{ oldText: "two\nthree\n", newText: "TWO_THREE\n" },
			{ oldText: "five\n", newText: "FIVE\n" },
		],
		hashline: [
			{ op: "replace_range", pos: tag(2, "two"), end: tag(3, "three"), lines: ["TWO_THREE"] },
			{ op: "replace_line", pos: tag(5, "five"), lines: ["FIVE"] },
		],
		expectExactSuccess: true,
		expectHashlineSuccess: true,
	},
	{
		name: "stale anchor hard fail",
		content: "alpha\nbeta\ngamma\n",
		hashline: [{ op: "replace_line", pos: parseTag("2#ZZ"), lines: ["BETA"] }],
		expectExactSuccess: false,
		expectHashlineSuccess: false,
	},
];

function runExact(testCase: BenchmarkCase) {
	if (!testCase.exact) return { success: false, elapsedMs: 0, error: "no exact case" };
	const start = performance.now();
	try {
		applyEditsToNormalizedContent(testCase.content.replace(/\r\n/g, "\n"), testCase.exact, testCase.name);
		return { success: true, elapsedMs: performance.now() - start };
	} catch (error) {
		return { success: false, elapsedMs: performance.now() - start, error: error instanceof Error ? error.message : String(error) };
	}
}

function runHashline(testCase: BenchmarkCase) {
	if (!testCase.hashline) return { success: false, elapsedMs: 0, error: "no hashline case" };
	const start = performance.now();
	try {
		applyHashlineEditsToNormalizedContent(testCase.content.replace(/\r\n/g, "\n"), testCase.hashline, testCase.name);
		return { success: true, elapsedMs: performance.now() - start };
	} catch (error) {
		return { success: false, elapsedMs: performance.now() - start, error: error instanceof Error ? error.message : String(error) };
	}
}

let exactPass = 0;
let hashlinePass = 0;
let exactTime = 0;
let hashlineTime = 0;

for (const testCase of cases) {
	const exact = runExact(testCase);
	const hashline = runHashline(testCase);
	exactTime += exact.elapsedMs;
	hashlineTime += hashline.elapsedMs;
	if (exact.success === testCase.expectExactSuccess) exactPass++;
	if (hashline.success === testCase.expectHashlineSuccess) hashlinePass++;

	console.log(`\n[${testCase.name}]`);
	console.log(`exact:    ${exact.success ? "pass" : "fail"} (${exact.elapsedMs.toFixed(2)}ms)${exact.error ? ` - ${exact.error}` : ""}`);
	console.log(`hashline: ${hashline.success ? "pass" : "fail"} (${hashline.elapsedMs.toFixed(2)}ms)${hashline.error ? ` - ${hashline.error}` : ""}`);
}

console.log("\nSummary");
console.log(`exact expectation matches: ${exactPass}/${cases.length}`);
console.log(`hashline expectation matches: ${hashlinePass}/${cases.length}`);
console.log(`exact total time: ${exactTime.toFixed(2)}ms`);
console.log(`hashline total time: ${hashlineTime.toFixed(2)}ms`);

if (exactPass !== cases.length || hashlinePass !== cases.length) {
	process.exitCode = 1;
}
