import { INTENT_GATE_TYPES } from "../../../../core/intent-gate.js";
import type { IntentFeatureKind } from "./types.js";
import type { IntentReviewResult, IntentReviewSuggestion } from "./types.js";

export const INTENT_REVIEW_SYSTEM_PROMPT = `You are reviewing aggregated intent-learning evidence for Daedalus.

You must only use the provided aggregate stats. Do not ask for or assume raw transcripts.

Goals:
1. Propose high-value heuristic additions where repeated phrasing strongly maps to one intent.
2. Call out phrases that seem already covered by the current heuristic and therefore low value.
3. Call out ambiguous phrases that should not become rules.
4. Prefer suggestions that would reduce mismatches against the current heuristic baseline.
5. Mention whether a suggestion feels globally useful or likely project-local.

Return JSON only. No markdown. Use this exact shape:
{
  "add": [{
    "id": "short-stable-id",
    "feature": "phrase",
    "kind": "leading-1|leading-2|leading-3|pattern",
    "targetIntent": "research|planning|implementation|investigation|evaluation|fix|open-ended",
    "scope": "global|project",
    "reason": "short reason",
    "confidence": 0.0,
    "totalCount": 0,
    "sessionCount": 0,
    "mismatchCount": 0,
    "currentHeuristicGuess": "...optional...",
    "examples": ["..."]
  }],
  "strengthen": [same object shape],
  "avoid": [same object shape, but still include targetIntent if one side dominates],
  "notes": ["short bullet", "short bullet"]
}

Rules:
- keep ids stable and slug-like
- only recommend add/strengthen for strong repeated evidence
- use avoid for ambiguous or low-value phrases
- keep notes short
- do not include fields outside the schema`;

const VALID_FEATURE_KINDS = new Set<IntentFeatureKind>(["leading-1", "leading-2", "leading-3", "pattern"]);
const VALID_INTENTS = new Set(INTENT_GATE_TYPES);

function extractJsonText(text: string): string {
	const trimmed = text.trim();
	if (trimmed.startsWith("```")) {
		const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/u);
		if (match?.[1]) {
			return match[1].trim();
		}
	}
	return trimmed;
}

function normalizeSuggestion(input: unknown, action: IntentReviewSuggestion["action"]): IntentReviewSuggestion | undefined {
	if (!input || typeof input !== "object") {
		return undefined;
	}
	const value = input as Record<string, unknown>;
	const feature = typeof value.feature === "string" ? value.feature.trim().toLowerCase() : "";
	const kind = typeof value.kind === "string" ? value.kind : "pattern";
	const targetIntent = typeof value.targetIntent === "string" ? value.targetIntent : undefined;
	if (!feature || !VALID_FEATURE_KINDS.has(kind as IntentFeatureKind) || !targetIntent || !VALID_INTENTS.has(targetIntent as any)) {
		return undefined;
	}
	const idBase = typeof value.id === "string" && value.id.trim().length > 0 ? value.id.trim() : `${kind}-${feature}`.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	return {
		id: idBase,
		action,
		feature,
		kind: kind as IntentFeatureKind,
		targetIntent: targetIntent as IntentReviewSuggestion["targetIntent"],
		scope: value.scope === "project" ? "project" : "global",
		reason: typeof value.reason === "string" ? value.reason.trim() : "",
		confidence: typeof value.confidence === "number" ? value.confidence : 0,
		totalCount: typeof value.totalCount === "number" ? value.totalCount : 0,
		sessionCount: typeof value.sessionCount === "number" ? value.sessionCount : 0,
		mismatchCount: typeof value.mismatchCount === "number" ? value.mismatchCount : 0,
		currentHeuristicGuess: typeof value.currentHeuristicGuess === "string" && VALID_INTENTS.has(value.currentHeuristicGuess as any)
			? (value.currentHeuristicGuess as IntentReviewSuggestion["targetIntent"])
			: undefined,
		examples: Array.isArray(value.examples) ? value.examples.filter((example): example is string => typeof example === "string").slice(0, 3) : [],
	};
}

export function parseIntentReviewResult(text: string): IntentReviewResult {
	const jsonText = extractJsonText(text);
	const parsed = JSON.parse(jsonText) as Record<string, unknown>;
	return {
		add: Array.isArray(parsed.add)
			? parsed.add.map((item) => normalizeSuggestion(item, "add")).filter((item): item is IntentReviewSuggestion => !!item)
			: [],
		strengthen: Array.isArray(parsed.strengthen)
			? parsed.strengthen
				.map((item) => normalizeSuggestion(item, "strengthen"))
				.filter((item): item is IntentReviewSuggestion => !!item)
			: [],
		avoid: Array.isArray(parsed.avoid)
			? parsed.avoid.map((item) => normalizeSuggestion(item, "avoid")).filter((item): item is IntentReviewSuggestion => !!item)
			: [],
		notes: Array.isArray(parsed.notes) ? parsed.notes.filter((item): item is string => typeof item === "string") : [],
		rawText: text,
	};
}

function formatSection(title: string, suggestions: IntentReviewSuggestion[], emptyMessage: string): string {
	if (suggestions.length === 0) {
		return `## ${title}\n- ${emptyMessage}`;
	}
	return `## ${title}\n${suggestions
		.map((suggestion) => {
			const guess = suggestion.currentHeuristicGuess ? `, current=${suggestion.currentHeuristicGuess}` : "";
			const examples = suggestion.examples.length > 0 ? ` e.g. ${suggestion.examples.map((example) => `“${example}”`).join("; ")}` : "";
			return `- [${suggestion.id}] ${suggestion.feature} [${suggestion.kind}] → ${suggestion.targetIntent} (${suggestion.scope}, confidence=${Math.round(suggestion.confidence * 100)}%, count=${suggestion.totalCount}, sessions=${suggestion.sessionCount}, mismatches=${suggestion.mismatchCount}${guess}) — ${suggestion.reason}${examples}`;
		})
		.join("\n")}`;
}

export function formatIntentReviewResult(result: IntentReviewResult): string {
	const sections = [
		"# Intent Review",
		formatSection("Add candidate rules", result.add, "No add candidates."),
		formatSection("Strengthen existing rules", result.strengthen, "No strengthen candidates."),
		formatSection("Ambiguous / do not add", result.avoid, "No avoid items."),
		result.notes.length > 0 ? `## Notes\n${result.notes.map((note) => `- ${note}`).join("\n")}` : "## Notes\n- No extra notes.",
	];
	return sections.join("\n\n");
}

export function getApprovableIntentSuggestions(result: IntentReviewResult): IntentReviewSuggestion[] {
	return [...result.add, ...result.strengthen];
}
