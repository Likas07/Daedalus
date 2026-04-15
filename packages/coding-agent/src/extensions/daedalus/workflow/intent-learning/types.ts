import type { IntentMetadata, IntentGateType, MutationScope } from "../../../../core/intent-gate.js";

export const INTENT_STATS_FILE_VERSION = 1;
export const INTENT_EXAMPLE_LIMIT_PER_BUCKET = 3;
export const INTENT_REVIEW_MIN_OCCURRENCES = 5;
export const INTENT_REVIEW_MIN_SESSIONS = 2;
export const INTENT_REVIEW_MIN_CONFIDENCE = 0.75;

export type IntentFeatureKind = "leading-1" | "leading-2" | "leading-3" | "pattern";

export type IntentCountsByType = Partial<Record<IntentGateType, number>>;

export interface IntentTurnSample {
	sampleId: string;
	sessionId: string;
	cwd: string;
	timestamp: string;
	intentEntryId: string;
	userMessageId?: string;
	userText: string;
	surfaceForm?: string;
	finalIntent: IntentGateType;
	mutationScope: MutationScope;
	readOnly: boolean;
	intentSource: IntentMetadata["source"];
	heuristicGuess: IntentGateType;
	mismatch: boolean;
}

export interface IntentExampleSnippet {
	sampleId: string;
	sessionId: string;
	intent: IntentGateType;
	text: string;
}

export interface IntentFeatureDescriptor {
	key: string;
	feature: string;
	kind: IntentFeatureKind;
}

export interface IntentFeatureStats extends IntentFeatureDescriptor {
	countsByIntent: IntentCountsByType;
	totalCount: number;
	sessionIds: string[];
	sessionCount: number;
	mismatchCount: number;
	currentHeuristicGuess?: IntentGateType;
	topIntent?: IntentGateType;
	confidence: number;
	ambiguous: boolean;
	examplesByIntent: Partial<Record<IntentGateType, IntentExampleSnippet[]>>;
}

export interface IntentStatsFile {
	version: typeof INTENT_STATS_FILE_VERSION;
	updatedAt: string;
	sampleCount: number;
	processedSamplesBySession: Record<string, string[]>;
	features: Record<string, IntentFeatureStats>;
}

export interface IntentFeatureReportRow {
	key: string;
	feature: string;
	kind: IntentFeatureKind;
	topIntent?: IntentGateType;
	currentHeuristicGuess?: IntentGateType;
	totalCount: number;
	sessionCount: number;
	mismatchCount: number;
	confidence: number;
	examples: string[];
}

export interface IntentCollectSummary {
	turnsSeen: number;
	newSamples: number;
	duplicateSamples: number;
	featuresUpdated: number;
	newFeatures: number;
	strongCandidates: IntentFeatureReportRow[];
	ambiguousFeatures: IntentFeatureReportRow[];
	highMismatchFeatures: IntentFeatureReportRow[];
	statsPath: string;
}

export interface IntentReviewEvidence {
	feature: string;
	kind: IntentFeatureKind;
	countsByIntent: IntentCountsByType;
	totalCount: number;
	sessionCount: number;
	confidence: number;
	mismatchCount: number;
	mismatchRate: number;
	currentHeuristicGuess?: IntentGateType;
	topIntent?: IntentGateType;
	examples: string[];
}

export interface IntentReviewPayload {
	generatedAt: string;
	sampleCount: number;
	featureCount: number;
	strongCandidates: IntentReviewEvidence[];
	ambiguousFeatures: IntentReviewEvidence[];
	highMismatchFeatures: IntentReviewEvidence[];
	alreadyCovered: IntentReviewEvidence[];
}

export type IntentReviewSuggestionAction = "add" | "strengthen" | "avoid";
export type IntentReviewSuggestionScope = "global" | "project";

export interface IntentReviewSuggestion {
	id: string;
	action: IntentReviewSuggestionAction;
	feature: string;
	kind: IntentFeatureKind;
	targetIntent: IntentGateType;
	scope: IntentReviewSuggestionScope;
	reason: string;
	confidence: number;
	totalCount: number;
	sessionCount: number;
	mismatchCount: number;
	currentHeuristicGuess?: IntentGateType;
	examples: string[];
}

export interface IntentReviewResult {
	add: IntentReviewSuggestion[];
	strengthen: IntentReviewSuggestion[];
	avoid: IntentReviewSuggestion[];
	notes: string[];
	rawText?: string;
}
