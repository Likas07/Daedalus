import type { AgentMessage } from "@daedalus-pi/agent-core";
import type { AssistantMessage, Message, TextContent } from "@daedalus-pi/ai";

export const INTENT_GATE_TYPES = [
	"research",
	"planning",
	"implementation",
	"investigation",
	"evaluation",
	"fix",
	"open-ended",
] as const;

export type IntentGateType = (typeof INTENT_GATE_TYPES)[number];

export const MUTATION_SCOPES = ["none", "docs-only", "code-allowed"] as const;
export type MutationScope = (typeof MUTATION_SCOPES)[number];

export const PLANNING_ARTIFACT_KINDS = ["docs", "plan", "spec", "design"] as const;
export type PlanningArtifactKind = (typeof PLANNING_ARTIFACT_KINDS)[number];

export interface IntentHeuristicRule {
	feature: string;
	kind: "leading-1" | "leading-2" | "leading-3" | "pattern";
	intent: IntentGateType;
	approach?: string;
	planningArtifactKind?: PlanningArtifactKind;
}

export interface IntentMetadata {
	surfaceForm?: string;
	trueIntent: IntentGateType;
	approach: string;
	readOnly: boolean;
	mutationScope: MutationScope;
	planningArtifactKind?: PlanningArtifactKind;
	source: "assistant-line" | "sdk" | "inferred" | "learned";
	valid: boolean;
}

export const INTENT_GATE_LINE_FORMAT =
	"Intent: <research|planning|implementation|investigation|evaluation|fix|open-ended> — <brief approach>";

const INTENT_GATE_PREFIX = "Intent:";
const INTENT_GATE_LINE_PATTERN = new RegExp(
	`^${INTENT_GATE_PREFIX}\\s*(research|planning|implementation|investigation|evaluation|fix|open-ended)\\s+—\\s+(.+?)\\s*$`,
	"u",
);
const READ_ONLY_PATTERN = /\b(read-only|readonly|no changes?|don't change|do not change|just explain|explain only)\b/i;
const PLANNING_PATTERN =
	/\b(plan|planning|spec|specification|requirements|design doc|design proposal|adr|architecture doc|roadmap|checklist|outline|proposal|migration plan)\b/i;
const FIX_PATTERN = /\b(fix|bug|broken|error|failing|fail|failed|failure|regression|repair|debug|issue|not working|crash)\b/i;
const EVALUATION_PATTERN =
	/\b(compare|evaluate|assessment|assess|opinion|thoughts|what do you think|should we|pros and cons|tradeoff|best way|which is better|recommend)\b/i;
const INVESTIGATION_PATTERN =
	/\b(investigate|look into|look at|check why|check what|dig into|inspect|find out|trace|root cause|see why)\b/i;
const RESEARCH_PATTERN =
	/\b(explain|how does|how do|how is|how are|why does|why do|what is|what does|what do|tell me about|walk me through|help me understand|understand)\b/i;
const IMPLEMENTATION_PATTERN =
	/\b(implement|add|create|build|write|change|update|modify|convert|replace|rename|switch|make|can you add|can you implement|show .* instead)\b/i;
const OPEN_ENDED_PATTERN = /\b(refactor|improve|clean up|cleanup|polish|tighten|better|simplify|streamline)\b/i;

export const INTENT_GATE_EXAMPLES = [
	"Intent: research — inspect relevant code and explain behavior.",
	"Intent: planning — inspect context and write plan docs only.",
	"Intent: fix — diagnose root cause, patch minimally, verify.",
] as const;

function normalizeInlineWhitespace(text: string): string {
	return text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeIntentText(text: string | undefined): string {
	return normalizeInlineWhitespace(text ?? "").toLowerCase();
}

function extractIntentWords(text: string | undefined): string[] {
	return normalizeIntentText(text).match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g) ?? [];
}

function getLeadingPhrase(words: string[], count: 1 | 2 | 3): string | undefined {
	if (words.length < count) {
		return undefined;
	}
	return words.slice(0, count).join(" ");
}

function extractTextBlocks(content: unknown): string[] {
	if (typeof content === "string") {
		return [content];
	}
	if (!Array.isArray(content)) {
		return [];
	}
	return content
		.filter((block): block is TextContent => !!block && typeof block === "object" && (block as { type?: string }).type === "text")
		.map((block) => block.text);
}

function inferIntentTypeFromBuiltInHeuristics(userText: string | undefined): IntentGateType {
	const text = normalizeIntentText(userText);
	if (!text) {
		return "research";
	}
	if (PLANNING_PATTERN.test(text)) {
		return "planning";
	}
	if (FIX_PATTERN.test(text)) {
		return "fix";
	}
	if (EVALUATION_PATTERN.test(text)) {
		return "evaluation";
	}
	if (INVESTIGATION_PATTERN.test(text)) {
		return "investigation";
	}
	if (RESEARCH_PATTERN.test(text)) {
		return "research";
	}
	if (IMPLEMENTATION_PATTERN.test(text)) {
		return "implementation";
	}
	if (OPEN_ENDED_PATTERN.test(text)) {
		return "open-ended";
	}
	return text.endsWith("?") ? "evaluation" : "research";
}

function getIntentRuleSpecificity(rule: IntentHeuristicRule): number {
	switch (rule.kind) {
		case "pattern":
			return 100 + rule.feature.split(/\s+/u).length;
		case "leading-3":
			return 30;
		case "leading-2":
			return 20;
		case "leading-1":
		default:
			return 10;
	}
}

function findMatchingIntentRule(userText: string | undefined, learnedRules: IntentHeuristicRule[] | undefined): IntentHeuristicRule | undefined {
	if (!learnedRules || learnedRules.length === 0) {
		return undefined;
	}

	const normalized = normalizeIntentText(userText);
	const words = extractIntentWords(userText);
	if (!normalized) {
		return undefined;
	}

	const sortedRules = [...learnedRules].sort((a, b) => getIntentRuleSpecificity(b) - getIntentRuleSpecificity(a));
	for (const rule of sortedRules) {
		const feature = normalizeIntentText(rule.feature);
		if (!feature) {
			continue;
		}
		if (rule.kind === "pattern") {
			if (normalized.startsWith(feature)) {
				return rule;
			}
			continue;
		}

		const count = rule.kind === "leading-3" ? 3 : rule.kind === "leading-2" ? 2 : 1;
		if (getLeadingPhrase(words, count) === feature) {
			return rule;
		}
	}

	return undefined;
}

function defaultApproachForIntent(intent: IntentGateType): string {
	switch (intent) {
		case "planning":
			return "inspect context and write plan docs only.";
		case "implementation":
			return "inspect context, change code, verify.";
		case "investigation":
			return "inspect relevant context and report findings.";
		case "evaluation":
			return "assess options and propose only.";
		case "fix":
			return "diagnose root cause, patch minimally, verify.";
		case "open-ended":
			return "inspect context first, then proceed carefully.";
		case "research":
		default:
			return "inspect relevant context and explain only.";
	}
}

export function extractFirstTextLine(message: Pick<Message, "content"> | Pick<AssistantMessage, "content"> | AgentMessage): string | undefined {
	if (!("content" in message)) {
		return undefined;
	}
	for (const block of extractTextBlocks(message.content)) {
		const [firstLine] = block.split(/\r?\n/u, 1);
		const normalized = normalizeInlineWhitespace(firstLine ?? "");
		if (normalized.length > 0) {
			return normalized;
		}
	}
	return undefined;
}

export function inferReadOnlyOverride(userText: string | undefined, approach?: string): boolean {
	return READ_ONLY_PATTERN.test(userText ?? "") || READ_ONLY_PATTERN.test(approach ?? "");
}

export function inferMutationScope(intent: IntentGateType, readOnly: boolean): MutationScope {
	if (readOnly) {
		return "none";
	}
	if (intent === "planning") {
		return "docs-only";
	}
	if (intent === "research" || intent === "investigation" || intent === "evaluation") {
		return "none";
	}
	return "code-allowed";
}

export function chooseMoreRestrictiveMutationScope(a: MutationScope, b: MutationScope): MutationScope {
	const rank: Record<MutationScope, number> = {
		none: 0,
		"docs-only": 1,
		"code-allowed": 2,
	};
	return rank[a] <= rank[b] ? a : b;
}

export function inferPlanningArtifactKind(value: string | undefined): PlanningArtifactKind | undefined {
	const text = (value ?? "").toLowerCase();
	if (!text) return undefined;
	if (text.includes("design") || text.includes("adr") || text.includes("architecture")) {
		return "design";
	}
	if (text.includes("spec") || text.includes("requirement") || text.includes("acceptance")) {
		return "spec";
	}
	if (text.includes("doc") || text.includes("readme") || text.includes("guide") || text.includes("reference")) {
		return "docs";
	}
	if (text.includes("plan") || text.includes("roadmap") || text.includes("checklist")) {
		return "plan";
	}
	return undefined;
}

export function inferSurfaceForm(userText: string | undefined): string | undefined {
	const text = normalizeInlineWhitespace(userText ?? "").toLowerCase();
	if (!text) return undefined;
	if (READ_ONLY_PATTERN.test(text)) return "read-only request";
	if (text.includes("how does") || text.startsWith("how ") || text.startsWith("explain ")) return "question";
	if (text.includes("investigate") || text.includes("look into") || text.includes("check ")) return "investigation request";
	if (text.includes("fix") || text.includes("broken") || text.includes("bug") || text.includes("error")) return "bug report";
	if (text.includes("plan") || text.includes("spec") || text.includes("design doc")) return "planning request";
	if (text.includes("implement") || text.includes("add ") || text.includes("create ") || text.includes("change ") || text.includes("update ")) {
		return "implementation request";
	}
	if (text.includes("what do you think") || text.includes("should we") || text.startsWith("evaluate ")) return "evaluation request";
	return "request";
}

export function inferIntentMetadataFromUserText(
	userText: string | undefined,
	options?: { learnedRules?: IntentHeuristicRule[] },
): IntentMetadata {
	const matchedRule = findMatchingIntentRule(userText, options?.learnedRules);
	const trueIntent = matchedRule?.intent ?? inferIntentTypeFromBuiltInHeuristics(userText);
	const approach = matchedRule?.approach ?? defaultApproachForIntent(trueIntent);
	const readOnly = inferReadOnlyOverride(userText, approach);
	return {
		surfaceForm: inferSurfaceForm(userText),
		trueIntent,
		approach,
		readOnly,
		mutationScope: inferMutationScope(trueIntent, readOnly),
		planningArtifactKind:
			trueIntent === "planning"
				? matchedRule?.planningArtifactKind ?? inferPlanningArtifactKind(userText) ?? "plan"
				: undefined,
		source: matchedRule ? "learned" : "inferred",
		valid: true,
	};
}

export function parseIntentLine(
	text: string,
	options?: {
		userText?: string;
		surfaceForm?: string;
		source?: IntentMetadata["source"];
	},
): IntentMetadata | undefined {
	const normalized = normalizeInlineWhitespace(text);
	const match = normalized.match(INTENT_GATE_LINE_PATTERN);
	if (!match) {
		return undefined;
	}

	const trueIntent = match[1] as IntentGateType;
	const approach = normalizeInlineWhitespace(match[2] ?? "");
	const readOnly = inferReadOnlyOverride(options?.userText, approach);

	return {
		surfaceForm: options?.surfaceForm ?? inferSurfaceForm(options?.userText),
		trueIntent,
		approach,
		readOnly,
		mutationScope: inferMutationScope(trueIntent, readOnly),
		planningArtifactKind: trueIntent === "planning" ? inferPlanningArtifactKind(approach) ?? "plan" : undefined,
		source: options?.source ?? "assistant-line",
		valid: true,
	};
}

export function stripLeadingIntentLineFromAssistantMessage(message: AssistantMessage): boolean {
	if (!Array.isArray(message.content)) {
		return false;
	}

	for (let index = 0; index < message.content.length; index++) {
		const block = message.content[index];
		if (block.type !== "text") {
			continue;
		}
		const match = block.text.match(/^(Intent:\s*(?:research|planning|implementation|investigation|evaluation|fix|open-ended)\s+—\s+.*?)(\r?\n|$)([\s\S]*)$/u);
		if (!match) {
			return false;
		}
		const rest = match[3] ?? "";
		if (rest.trim().length > 0) {
			block.text = rest.replace(/^\s*\n/u, "");
		} else {
			message.content.splice(index, 1);
		}
		return true;
	}

	return false;
}

export function buildIntentGatePromptBlock(): string {
	return `## Intent Gate (per user request)

On first assistant turn after a new user request, begin with exactly one short line in this format:

${INTENT_GATE_LINE_FORMAT}

Rules:
- classify user request, not your own changing subtask
- emit this line only once for that user request
- do not repeat or revise it on later assistant turns for same request
- first identify surface form, then infer likely true intent, then choose final intent class from true intent
- research: inspect and explain only
- planning: inspect relevant context and write/update planning markdown only; if you write a planning artifact, keep it under docs/, plans/, specs/, or design/
- investigation: inspect and report only unless user explicitly asked you to resolve it
- evaluation: assess and propose only unless user explicitly asked you to execute
- fix: diagnose first, then make smallest correct change
- implementation: inspect relevant context first, then implement
- open-ended: inspect first; ask one clarifying question only if needed
- if user explicitly asked for read-only behavior, no changes, or explanation only, that overrides everything else; say so in approach and do not mutate files
- when editing is needed, prefer current safe workflow for active tools (for example read(format: "hashline") before hashline_edit)

Keep this line brief. One line per user request, not per assistant turn.`;
}
