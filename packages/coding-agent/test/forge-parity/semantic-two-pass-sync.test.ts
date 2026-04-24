import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../src/extensions/daedalus/tools/semantic-store.ts", import.meta.url), "utf8");

describe("semantic sync memory-conscious two pass", () => {
	it("performs a hash/stat planning pass before re-reading changed file content for chunk upload", () => {
		const scanIndex = source.indexOf("const localFiles: SemanticLocalFileState[] = []");
		const planIndex = source.indexOf("const plan = buildSemanticSyncPlan(localFiles, indexedFiles, failedFiles)");
		const contentReadIndex = source.indexOf("const content = await readTextFile(absolutePath)", planIndex);
		expect(scanIndex).toBeGreaterThan(-1);
		expect(planIndex).toBeGreaterThan(scanIndex);
		expect(contentReadIndex).toBeGreaterThan(planIndex);
	});

	it("preserves skip telemetry for generated and minified files skipped during scan", () => {
		const contentSkipIndex = source.indexOf("const contentSkipReason = semanticContentSkipReason(absolutePath)");
		const incrementIndex = source.indexOf("incrementSkip(skippedByReason, contentSkipReason)", contentSkipIndex);
		const skippedCountIndex = source.indexOf("skipped += 1", contentSkipIndex);
		expect(contentSkipIndex).toBeGreaterThan(-1);
		expect(incrementIndex).toBeGreaterThan(contentSkipIndex);
		expect(skippedCountIndex).toBeGreaterThan(contentSkipIndex);
	});
});
