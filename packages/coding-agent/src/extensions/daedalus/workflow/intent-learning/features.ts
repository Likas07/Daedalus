import { inferIntentMetadataFromUserText } from "../../../../core/intent-gate.js";
import { extractNormalizedWords, getLeadingPhrase, normalizeIntentUserText } from "./normalize.js";
import type { IntentFeatureDescriptor } from "./types.js";

const HIGH_SIGNAL_PATTERNS = [
	"how does",
	"how do",
	"how is",
	"how are",
	"why does",
	"why do",
	"what is",
	"what does",
	"what do you think",
	"can you add",
	"can you implement",
	"look into",
	"check why",
	"check what",
	"fix",
	"plan",
] as const;

function pushFeature(features: Map<string, IntentFeatureDescriptor>, descriptor: IntentFeatureDescriptor): void {
	features.set(descriptor.key, descriptor);
}

export function extractIntentFeatures(userText: string): IntentFeatureDescriptor[] {
	const features = new Map<string, IntentFeatureDescriptor>();
	const normalized = normalizeIntentUserText(userText);
	const words = extractNormalizedWords(userText);

	const leadingOne = getLeadingPhrase(words, 1);
	if (leadingOne) {
		pushFeature(features, { key: `leading-1:${leadingOne}`, feature: leadingOne, kind: "leading-1" });
	}

	const leadingTwo = getLeadingPhrase(words, 2);
	if (leadingTwo) {
		pushFeature(features, { key: `leading-2:${leadingTwo}`, feature: leadingTwo, kind: "leading-2" });
	}

	const leadingThree = getLeadingPhrase(words, 3);
	if (leadingThree) {
		pushFeature(features, { key: `leading-3:${leadingThree}`, feature: leadingThree, kind: "leading-3" });
	}

	for (const pattern of HIGH_SIGNAL_PATTERNS) {
		if (normalized.startsWith(pattern)) {
			pushFeature(features, { key: `pattern:${pattern}`, feature: pattern, kind: "pattern" });
		}
	}

	return Array.from(features.values());
}

export function getCurrentHeuristicGuessForFeature(feature: string) {
	return inferIntentMetadataFromUserText(feature).trueIntent;
}
