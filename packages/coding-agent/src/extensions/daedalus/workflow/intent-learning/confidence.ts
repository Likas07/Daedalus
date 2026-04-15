import type { IntentGateType } from "../../../../core/intent-gate.js";
import type { IntentCountsByType } from "./types.js";

export interface DominantIntentResult {
	topIntent?: IntentGateType;
	topCount: number;
	totalCount: number;
	confidence: number;
}

export function getTotalIntentCount(countsByIntent: IntentCountsByType): number {
	return Object.values(countsByIntent).reduce((sum, count) => sum + (count ?? 0), 0);
}

export function getDominantIntent(countsByIntent: IntentCountsByType): DominantIntentResult {
	let topIntent: IntentGateType | undefined;
	let topCount = 0;
	const totalCount = getTotalIntentCount(countsByIntent);

	for (const [intent, count] of Object.entries(countsByIntent)) {
		const value = count ?? 0;
		if (value > topCount) {
			topIntent = intent as IntentGateType;
			topCount = value;
		}
	}

	return {
		topIntent,
		topCount,
		totalCount,
		confidence: totalCount > 0 ? topCount / totalCount : 0,
	};
}

export function isIntentFeatureAmbiguous(countsByIntent: IntentCountsByType, minimumConfidence = 0.75): boolean {
	const dominant = getDominantIntent(countsByIntent);
	return dominant.totalCount > 0 && dominant.confidence < minimumConfidence;
}
