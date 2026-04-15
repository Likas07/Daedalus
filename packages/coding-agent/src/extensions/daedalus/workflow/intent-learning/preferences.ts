import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { IntentHeuristicRule, IntentGateType, PlanningArtifactKind } from "../../../../core/intent-gate.js";
import {
	getIntentHeuristicsPath,
	getProjectIntentHeuristicsPath,
} from "../../../../config.js";
import type { IntentFeatureKind, IntentReviewSuggestionScope } from "./types.js";

export const INTENT_HEURISTICS_FILE_VERSION = 1;

export interface IntentHeuristicEvidence {
	confidence: number;
	totalCount: number;
	sessionCount: number;
	mismatchCount: number;
	examples: string[];
	currentHeuristicGuess?: IntentGateType;
}

export interface LearnedIntentHeuristicRule extends IntentHeuristicRule {
	id: string;
	intent: IntentGateType;
	kind: IntentFeatureKind;
	feature: string;
	scope: IntentReviewSuggestionScope;
	addedAt: string;
	source: "review" | "manual";
	note?: string;
	evidence?: IntentHeuristicEvidence;
	planningArtifactKind?: PlanningArtifactKind;
	approach?: string;
}

export interface IntentHeuristicsFile {
	version: typeof INTENT_HEURISTICS_FILE_VERSION;
	updatedAt: string;
	rules: LearnedIntentHeuristicRule[];
}

function createEmptyIntentHeuristicsFile(): IntentHeuristicsFile {
	return {
		version: INTENT_HEURISTICS_FILE_VERSION,
		updatedAt: new Date(0).toISOString(),
		rules: [],
	};
}

function normalizeRule(rule: LearnedIntentHeuristicRule): LearnedIntentHeuristicRule {
	return {
		...rule,
		feature: rule.feature.trim().toLowerCase(),
		kind: rule.kind,
		intent: rule.intent,
	};
}

function ruleKey(rule: Pick<LearnedIntentHeuristicRule, "kind" | "feature">): string {
	return `${rule.kind}:${rule.feature.trim().toLowerCase()}`;
}

function normalizeFile(file: IntentHeuristicsFile | undefined): IntentHeuristicsFile {
	if (!file || file.version !== INTENT_HEURISTICS_FILE_VERSION) {
		return createEmptyIntentHeuristicsFile();
	}

	const unique = new Map<string, LearnedIntentHeuristicRule>();
	for (const rawRule of file.rules ?? []) {
		if (!rawRule?.feature || !rawRule?.kind || !rawRule?.intent) {
			continue;
		}
		const normalizedRule = {
			...rawRule,
			feature: rawRule.feature.trim().toLowerCase(),
		};
		unique.set(ruleKey(normalizedRule), normalizedRule);
	}

	return {
		version: INTENT_HEURISTICS_FILE_VERSION,
		updatedAt: file.updatedAt || new Date(0).toISOString(),
		rules: Array.from(unique.values()),
	};
}

export function readIntentHeuristicsFile(path: string): IntentHeuristicsFile {
	if (!existsSync(path)) {
		return createEmptyIntentHeuristicsFile();
	}
	try {
		return normalizeFile(JSON.parse(readFileSync(path, "utf-8")) as IntentHeuristicsFile);
	} catch {
		return createEmptyIntentHeuristicsFile();
	}
}

export function writeIntentHeuristicsFile(file: IntentHeuristicsFile, path: string): void {
	const dir = dirname(path);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const tempPath = `${path}.tmp`;
	writeFileSync(tempPath, `${JSON.stringify(normalizeFile(file), null, 2)}\n`, "utf-8");
	renameSync(tempPath, path);
}

export function getIntentHeuristicsFilePath(scope: IntentReviewSuggestionScope, cwd: string): string {
	return scope === "project" ? getProjectIntentHeuristicsPath(cwd) : getIntentHeuristicsPath();
}

export function loadMergedIntentHeuristicRules(cwd: string): LearnedIntentHeuristicRule[] {
	const globalRules = readIntentHeuristicsFile(getIntentHeuristicsPath()).rules.map((rule) => ({ ...rule, scope: "global" as const }));
	const projectRules = readIntentHeuristicsFile(getProjectIntentHeuristicsPath(cwd)).rules.map((rule) => ({ ...rule, scope: "project" as const }));
	const seen = new Set<string>();
	const merged: LearnedIntentHeuristicRule[] = [];

	for (const rule of [...projectRules, ...globalRules]) {
		const key = ruleKey(rule);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		merged.push(rule);
	}

	return merged;
}

export function upsertLearnedIntentRules(
	existingFile: IntentHeuristicsFile | undefined,
	rules: LearnedIntentHeuristicRule[],
): IntentHeuristicsFile {
	const file = normalizeFile(existingFile);
	const merged = new Map<string, LearnedIntentHeuristicRule>();
	for (const rule of file.rules) {
		merged.set(ruleKey(rule), rule);
	}
	for (const rawRule of rules) {
		const rule = normalizeRule(rawRule);
		const existing = merged.get(ruleKey(rule));
		merged.set(ruleKey(rule), {
			...existing,
			...rule,
			addedAt: existing?.addedAt ?? rule.addedAt,
		});
	}

	return {
		version: INTENT_HEURISTICS_FILE_VERSION,
		updatedAt: new Date().toISOString(),
		rules: Array.from(merged.values()),
	};
}
