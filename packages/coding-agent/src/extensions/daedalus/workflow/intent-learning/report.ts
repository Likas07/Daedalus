import {
	INTENT_REVIEW_MIN_CONFIDENCE,
	INTENT_REVIEW_MIN_OCCURRENCES,
	INTENT_REVIEW_MIN_SESSIONS,
	type IntentCollectSummary,
	type IntentFeatureReportRow,
	type IntentFeatureStats,
	type IntentStatsFile,
} from "./types.js";

function sortByValue(features: IntentFeatureStats[], score: (feature: IntentFeatureStats) => number): IntentFeatureStats[] {
	return [...features].sort((left, right) => score(right) - score(left) || right.totalCount - left.totalCount || left.feature.localeCompare(right.feature));
}

function toExamples(stats: IntentFeatureStats): string[] {
	return Object.values(stats.examplesByIntent)
		.flat()
		.map((example) => example.text)
		.slice(0, 3);
}

function toReportRow(stats: IntentFeatureStats): IntentFeatureReportRow {
	return {
		key: stats.key,
		feature: stats.feature,
		kind: stats.kind,
		topIntent: stats.topIntent,
		currentHeuristicGuess: stats.currentHeuristicGuess,
		totalCount: stats.totalCount,
		sessionCount: stats.sessionCount,
		mismatchCount: stats.mismatchCount,
		confidence: stats.confidence,
		examples: toExamples(stats),
	};
}

function allFeatures(statsFile: IntentStatsFile): IntentFeatureStats[] {
	return Object.values(statsFile.features);
}

export function getStrongIntentCandidates(statsFile: IntentStatsFile): IntentFeatureStats[] {
	return sortByValue(
		allFeatures(statsFile).filter(
			(feature) =>
				feature.totalCount >= INTENT_REVIEW_MIN_OCCURRENCES &&
				feature.sessionCount >= INTENT_REVIEW_MIN_SESSIONS &&
				feature.confidence >= INTENT_REVIEW_MIN_CONFIDENCE &&
				!!feature.topIntent,
		),
		(feature) => feature.confidence * feature.totalCount + feature.mismatchCount * 2,
	);
}

export function getAmbiguousIntentFeatures(statsFile: IntentStatsFile): IntentFeatureStats[] {
	return sortByValue(
		allFeatures(statsFile).filter(
			(feature) => feature.totalCount >= 2 && feature.confidence < INTENT_REVIEW_MIN_CONFIDENCE,
		),
		(feature) => feature.totalCount * (1 - feature.confidence),
	);
}

export function getHighMismatchIntentFeatures(statsFile: IntentStatsFile): IntentFeatureStats[] {
	return sortByValue(
		allFeatures(statsFile).filter((feature) => feature.mismatchCount > 0),
		(feature) => feature.mismatchCount * 10 + feature.totalCount,
	);
}

export function getAlreadyCoveredIntentFeatures(statsFile: IntentStatsFile): IntentFeatureStats[] {
	return sortByValue(
		allFeatures(statsFile).filter(
			(feature) =>
				feature.totalCount >= INTENT_REVIEW_MIN_OCCURRENCES &&
				feature.confidence >= INTENT_REVIEW_MIN_CONFIDENCE &&
				feature.currentHeuristicGuess === feature.topIntent,
		),
		(feature) => feature.confidence * feature.totalCount,
	);
}

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function formatRows(title: string, rows: IntentFeatureReportRow[], emptyMessage: string): string {
	if (rows.length === 0) {
		return `## ${title}\n- ${emptyMessage}`;
	}

	const body = rows
		.map((row) => {
			const examples = row.examples.length > 0 ? ` e.g. ${row.examples.map((example) => `“${example}”`).join("; ")}` : "";
			const guess = row.currentHeuristicGuess ? `, heuristic=${row.currentHeuristicGuess}` : "";
			return `- ${row.feature} [${row.kind}] → ${row.topIntent ?? "unknown"} (${formatPercent(row.confidence)}, count=${row.totalCount}, sessions=${row.sessionCount}, mismatches=${row.mismatchCount}${guess})${examples}`;
		})
		.join("\n");

	return `## ${title}\n${body}`;
}

export function formatIntentCollectSummary(summary: IntentCollectSummary): string {
	const sections = [
		"# Intent Collect Summary",
		`- turns seen: ${summary.turnsSeen}`,
		`- new samples merged: ${summary.newSamples}`,
		`- duplicate samples skipped: ${summary.duplicateSamples}`,
		`- features updated: ${summary.featuresUpdated}`,
		`- new features: ${summary.newFeatures}`,
		`- stats file: ${summary.statsPath}`,
		formatRows("Strong candidates", summary.strongCandidates, "No strong candidates yet."),
		formatRows("Ambiguous features", summary.ambiguousFeatures, "No ambiguous features worth surfacing yet."),
		formatRows("High-mismatch features", summary.highMismatchFeatures, "No mismatch hotspots yet."),
	];

	return sections.join("\n\n");
}

export function buildIntentFeatureRows(stats: IntentStatsFile) {
	return {
		strongCandidates: getStrongIntentCandidates(stats).map(toReportRow),
		ambiguousFeatures: getAmbiguousIntentFeatures(stats).map(toReportRow),
		highMismatchFeatures: getHighMismatchIntentFeatures(stats).map(toReportRow),
		alreadyCovered: getAlreadyCoveredIntentFeatures(stats).map(toReportRow),
	};
}
