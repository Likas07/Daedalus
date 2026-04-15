import { buildIntentFeatureRows } from "./report.js";
import type { IntentReviewEvidence, IntentReviewPayload, IntentStatsFile } from "./types.js";

function toEvidence(row: ReturnType<typeof buildIntentFeatureRows>["strongCandidates"][number]): IntentReviewEvidence {
	return {
		feature: row.feature,
		kind: row.kind,
		countsByIntent: {},
		totalCount: row.totalCount,
		sessionCount: row.sessionCount,
		confidence: row.confidence,
		mismatchCount: row.mismatchCount,
		mismatchRate: row.totalCount > 0 ? row.mismatchCount / row.totalCount : 0,
		currentHeuristicGuess: row.currentHeuristicGuess,
		topIntent: row.topIntent,
		examples: row.examples,
	};
}

function enrichWithCounts(statsFile: IntentStatsFile, evidence: IntentReviewEvidence[]): IntentReviewEvidence[] {
	return evidence.map((item) => {
		const match = Object.values(statsFile.features).find((feature) => feature.feature === item.feature && feature.kind === item.kind);
		return {
			...item,
			countsByIntent: { ...(match?.countsByIntent ?? {}) },
		};
	});
}

export function buildIntentReviewPayload(statsFile: IntentStatsFile): IntentReviewPayload {
	const rows = buildIntentFeatureRows(statsFile);
	return {
		generatedAt: new Date().toISOString(),
		sampleCount: statsFile.sampleCount,
		featureCount: Object.keys(statsFile.features).length,
		strongCandidates: enrichWithCounts(statsFile, rows.strongCandidates.slice(0, 12).map(toEvidence)),
		ambiguousFeatures: enrichWithCounts(statsFile, rows.ambiguousFeatures.slice(0, 12).map(toEvidence)),
		highMismatchFeatures: enrichWithCounts(statsFile, rows.highMismatchFeatures.slice(0, 12).map(toEvidence)),
		alreadyCovered: enrichWithCounts(statsFile, rows.alreadyCovered.slice(0, 12).map(toEvidence)),
	};
}

export function buildIntentReviewUserMessage(statsFile: IntentStatsFile): string {
	const payload = buildIntentReviewPayload(statsFile);
	return [
		"Review the following aggregated intent-learning evidence and propose heuristic updates.",
		"Use only this aggregate data.",
		"",
		JSON.stringify(payload, null, 2),
	].join("\n");
}
