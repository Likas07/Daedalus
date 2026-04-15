import { getDominantIntent, isIntentFeatureAmbiguous } from "./confidence.js";
import { extractIntentFeatures, getCurrentHeuristicGuessForFeature } from "./features.js";
import { sanitizeIntentExampleSnippet } from "./normalize.js";
import {
	INTENT_EXAMPLE_LIMIT_PER_BUCKET,
	INTENT_REVIEW_MIN_CONFIDENCE,
	type IntentCollectSummary,
	type IntentExampleSnippet,
	type IntentFeatureReportRow,
	type IntentFeatureStats,
	type IntentStatsFile,
	type IntentTurnSample,
} from "./types.js";
import { getAmbiguousIntentFeatures, getHighMismatchIntentFeatures, getStrongIntentCandidates } from "./report.js";

function createEmptyStatsFile(): IntentStatsFile {
	return {
		version: 1,
		updatedAt: new Date(0).toISOString(),
		sampleCount: 0,
		processedSamplesBySession: {},
		features: {},
	};
}

function createFeatureStats(key: string, feature: string, kind: IntentFeatureStats["kind"]): IntentFeatureStats {
	return {
		key,
		feature,
		kind,
		countsByIntent: {},
		totalCount: 0,
		sessionIds: [],
		sessionCount: 0,
		mismatchCount: 0,
		currentHeuristicGuess: getCurrentHeuristicGuessForFeature(feature),
		topIntent: undefined,
		confidence: 0,
		ambiguous: false,
		examplesByIntent: {},
	};
}

function addExample(stats: IntentFeatureStats, sample: IntentTurnSample): void {
	const bucket = stats.examplesByIntent[sample.finalIntent] ?? [];
	const snippet: IntentExampleSnippet = {
		sampleId: sample.sampleId,
		sessionId: sample.sessionId,
		intent: sample.finalIntent,
		text: sanitizeIntentExampleSnippet(sample.userText),
	};

	if (bucket.some((existing) => existing.sampleId === snippet.sampleId || existing.text === snippet.text)) {
		stats.examplesByIntent[sample.finalIntent] = bucket;
		return;
	}

	bucket.push(snippet);
	stats.examplesByIntent[sample.finalIntent] = bucket.slice(0, INTENT_EXAMPLE_LIMIT_PER_BUCKET);
}

function refreshDerivedStats(stats: IntentFeatureStats): void {
	const dominant = getDominantIntent(stats.countsByIntent);
	stats.topIntent = dominant.topIntent;
	stats.confidence = dominant.confidence;
	stats.ambiguous = isIntentFeatureAmbiguous(stats.countsByIntent, INTENT_REVIEW_MIN_CONFIDENCE);
	stats.sessionCount = stats.sessionIds.length;
	stats.currentHeuristicGuess = getCurrentHeuristicGuessForFeature(stats.feature);
}

export function normalizeIntentStatsFile(statsFile: IntentStatsFile | undefined): IntentStatsFile {
	if (!statsFile || statsFile.version !== 1) {
		return createEmptyStatsFile();
	}

	const normalized = createEmptyStatsFile();
	normalized.updatedAt = statsFile.updatedAt || normalized.updatedAt;
	normalized.sampleCount = statsFile.sampleCount || 0;
	normalized.processedSamplesBySession = Object.fromEntries(
		Object.entries(statsFile.processedSamplesBySession ?? {}).map(([sessionId, sampleIds]) => [
			sessionId,
			Array.from(new Set(sampleIds ?? [])),
		]),
	);

	for (const [key, value] of Object.entries(statsFile.features ?? {})) {
		const featureStats = createFeatureStats(key, value.feature, value.kind);
		featureStats.countsByIntent = { ...value.countsByIntent };
		featureStats.totalCount = value.totalCount ?? 0;
		featureStats.sessionIds = Array.from(new Set(value.sessionIds ?? []));
		featureStats.mismatchCount = value.mismatchCount ?? 0;
		featureStats.examplesByIntent = value.examplesByIntent ?? {};
		refreshDerivedStats(featureStats);
		normalized.features[key] = featureStats;
	}

	return normalized;
}

function flattenExamples(stats: IntentFeatureStats): string[] {
	return Object.values(stats.examplesByIntent)
		.flat()
		.map((example) => example.text)
		.slice(0, INTENT_EXAMPLE_LIMIT_PER_BUCKET);
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
		examples: flattenExamples(stats),
	};
}

export function mergeIntentSamplesIntoStats(
	existingStatsFile: IntentStatsFile | undefined,
	samples: IntentTurnSample[],
	statsPath: string,
): { statsFile: IntentStatsFile; summary: IntentCollectSummary } {
	const statsFile = normalizeIntentStatsFile(existingStatsFile);
	const updatedFeatureKeys = new Set<string>();
	const newFeatureKeys = new Set<string>();
	let newSamples = 0;
	let duplicateSamples = 0;

	for (const sample of samples) {
		const processed = new Set(statsFile.processedSamplesBySession[sample.sessionId] ?? []);
		if (processed.has(sample.sampleId)) {
			duplicateSamples++;
			continue;
		}

		const features = extractIntentFeatures(sample.userText);
		processed.add(sample.sampleId);
		statsFile.processedSamplesBySession[sample.sessionId] = Array.from(processed);
		statsFile.sampleCount += 1;
		newSamples += 1;

		for (const descriptor of features) {
			const existed = descriptor.key in statsFile.features;
			const featureStats = statsFile.features[descriptor.key] ?? createFeatureStats(descriptor.key, descriptor.feature, descriptor.kind);
			featureStats.countsByIntent[sample.finalIntent] = (featureStats.countsByIntent[sample.finalIntent] ?? 0) + 1;
			featureStats.totalCount += 1;
			if (!featureStats.sessionIds.includes(sample.sessionId)) {
				featureStats.sessionIds.push(sample.sessionId);
			}
			if (sample.mismatch) {
				featureStats.mismatchCount += 1;
			}
			addExample(featureStats, sample);
			refreshDerivedStats(featureStats);
			statsFile.features[descriptor.key] = featureStats;
			updatedFeatureKeys.add(descriptor.key);
			if (!existed) {
				newFeatureKeys.add(descriptor.key);
			}
		}
	}

	statsFile.updatedAt = new Date().toISOString();

	return {
		statsFile,
		summary: {
			turnsSeen: samples.length,
			newSamples,
			duplicateSamples,
			featuresUpdated: updatedFeatureKeys.size,
			newFeatures: newFeatureKeys.size,
			strongCandidates: getStrongIntentCandidates(statsFile).slice(0, 5).map(toReportRow),
			ambiguousFeatures: getAmbiguousIntentFeatures(statsFile).slice(0, 5).map(toReportRow),
			highMismatchFeatures: getHighMismatchIntentFeatures(statsFile).slice(0, 5).map(toReportRow),
			statsPath,
		},
	};
}
