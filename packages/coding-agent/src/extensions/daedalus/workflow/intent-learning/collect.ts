import { inferIntentMetadataFromUserText } from "../../../../core/intent-gate.js";
import type { SessionEntry } from "../../../../core/session-manager.js";
import { extractMessageText, findPairedUserEntry, isIntentEntry } from "./filter.js";
import type { IntentTurnSample } from "./types.js";

export interface CollectIntentSamplesOptions {
	sessionId: string;
	cwd: string;
	branch: SessionEntry[];
}

export function collectIntentTurnSamplesFromBranch(options: CollectIntentSamplesOptions): IntentTurnSample[] {
	const samples: IntentTurnSample[] = [];

	for (const [index, entry] of options.branch.entries()) {
		if (!isIntentEntry(entry) || !entry.requestId || entry.locked === false || entry.metadata.valid === false || entry.synthetic) {
			continue;
		}

		const userEntry = findPairedUserEntry(options.branch, index);
		if (!userEntry) {
			continue;
		}

		const userText = extractMessageText(userEntry.message);
		if (!userText) {
			continue;
		}

		const inferred = inferIntentMetadataFromUserText(userText);
		samples.push({
			sampleId: `${options.sessionId}:${entry.requestId}`,
			sessionId: options.sessionId,
			cwd: options.cwd,
			timestamp: entry.timestamp,
			intentEntryId: entry.id,
			userMessageId: entry.userMessageId ?? userEntry.id,
			userText,
			surfaceForm: entry.metadata.surfaceForm ?? inferred.surfaceForm,
			finalIntent: entry.metadata.trueIntent,
			mutationScope: entry.metadata.mutationScope,
			readOnly: entry.metadata.readOnly,
			intentSource: entry.metadata.source,
			heuristicGuess: inferred.trueIntent,
			mismatch: inferred.trueIntent !== entry.metadata.trueIntent,
		});
	}

	return samples;
}
