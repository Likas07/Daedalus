import type { PlanningArtifactKind } from "../../../../core/intent-gate.js";
import type { IntentReviewResult, IntentReviewSuggestion, IntentReviewSuggestionScope } from "./types.js";
import {
	getIntentHeuristicsFilePath,
	readIntentHeuristicsFile,
	upsertLearnedIntentRules,
	writeIntentHeuristicsFile,
	type LearnedIntentHeuristicRule,
} from "./preferences.js";
import { getApprovableIntentSuggestions } from "./review-format.js";

export interface ApplyIntentReviewSuggestionsOptions {
	cwd: string;
	scope: IntentReviewSuggestionScope;
	selectedIds?: string[];
}

export interface ApplyIntentReviewSuggestionsResult {
	appliedCount: number;
	skippedCount: number;
	path: string;
	appliedIds: string[];
}

function inferPlanningArtifactKind(feature: string, intent: IntentReviewSuggestion["targetIntent"]): PlanningArtifactKind | undefined {
	if (intent !== "planning") {
		return undefined;
	}
	if (feature.includes("spec")) return "spec";
	if (feature.includes("design") || feature.includes("adr") || feature.includes("architecture")) return "design";
	if (feature.includes("doc") || feature.includes("readme")) return "docs";
	return "plan";
}

function suggestionToRule(suggestion: IntentReviewSuggestion, scope: IntentReviewSuggestionScope): LearnedIntentHeuristicRule {
	return {
		id: suggestion.id,
		feature: suggestion.feature,
		kind: suggestion.kind,
		intent: suggestion.targetIntent,
		scope,
		addedAt: new Date().toISOString(),
		source: "review",
		note: suggestion.reason,
		evidence: {
			confidence: suggestion.confidence,
			totalCount: suggestion.totalCount,
			sessionCount: suggestion.sessionCount,
			mismatchCount: suggestion.mismatchCount,
			examples: suggestion.examples,
			currentHeuristicGuess: suggestion.currentHeuristicGuess,
		},
		approach: undefined,
		planningArtifactKind: inferPlanningArtifactKind(suggestion.feature, suggestion.targetIntent),
	};
}

export function applyIntentReviewSuggestions(
	review: IntentReviewResult,
	options: ApplyIntentReviewSuggestionsOptions,
): ApplyIntentReviewSuggestionsResult {
	const allowedIds = options.selectedIds ? new Set(options.selectedIds.map((id) => id.trim()).filter(Boolean)) : undefined;
	const candidates = getApprovableIntentSuggestions(review).filter(
		(suggestion) => !allowedIds || allowedIds.has(suggestion.id),
	);
	const path = getIntentHeuristicsFilePath(options.scope, options.cwd);
	const existing = readIntentHeuristicsFile(path);
	const rules = candidates.map((suggestion) => suggestionToRule(suggestion, options.scope));
	const next = upsertLearnedIntentRules(existing, rules);
	writeIntentHeuristicsFile(next, path);
	return {
		appliedCount: candidates.length,
		skippedCount: getApprovableIntentSuggestions(review).length - candidates.length,
		path,
		appliedIds: candidates.map((candidate) => candidate.id),
	};
}
