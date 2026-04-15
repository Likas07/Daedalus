import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { getIntentStatsPath } from "../../../config.js";
import { collectIntentTurnSamplesFromBranch } from "./intent-learning/collect.js";
import { mergeIntentSamplesIntoStats } from "./intent-learning/aggregate.js";
import { formatIntentCollectSummary } from "./intent-learning/report.js";
import { readIntentStatsFile, writeIntentStatsFile } from "./intent-learning/storage.js";

export default function intentCollect(pi: ExtensionAPI) {
	pi.registerCommand("intent-collect", {
		description: "Collect current-branch intent language stats into the global store",
		handler: async (_args, ctx) => {
			const branch = ctx.sessionManager.getBranch();
			const samples = collectIntentTurnSamplesFromBranch({
				sessionId: ctx.sessionManager.getSessionId(),
				cwd: ctx.cwd,
				branch,
			});

			const statsPath = getIntentStatsPath();
			const existing = readIntentStatsFile(statsPath);
			const { statsFile, summary } = mergeIntentSamplesIntoStats(existing, samples, statsPath);
			writeIntentStatsFile(statsFile, statsPath);

			const report = formatIntentCollectSummary(summary);

			pi.sendMessage(
				{
					customType: "intent-collect-report",
					content: report,
					display: true,
				},
				{ triggerTurn: false },
			);
			if (ctx.hasUI) {
				ctx.ui.notify(`Intent collection complete: ${summary.newSamples} new samples`, "info");
			}
		},
	});
}
