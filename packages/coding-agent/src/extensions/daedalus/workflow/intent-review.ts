import { complete, type Message } from "@daedalus-pi/ai";
import { BorderedLoader, type ExtensionAPI, type ExtensionContext } from "@daedalus-pi/coding-agent";
import { requireModel } from "../shared/ui.js";
import { resolveModelAuth } from "../shared/model-auth.js";
import { applyIntentReviewSuggestions } from "./intent-learning/apply.js";
import { buildIntentReviewPayload, buildIntentReviewUserMessage } from "./intent-learning/review-prompt.js";
import {
	formatIntentReviewResult,
	getApprovableIntentSuggestions,
	INTENT_REVIEW_SYSTEM_PROMPT,
	parseIntentReviewResult,
} from "./intent-learning/review-format.js";
import { readIntentStatsFile } from "./intent-learning/storage.js";
import type { IntentReviewResult, IntentReviewSuggestionScope } from "./intent-learning/types.js";

function parseReviewCommandArgs(args: string): {
	applyScope?: IntentReviewSuggestionScope;
	selectedIds?: string[];
} {
	const normalized = args.trim();
	if (!normalized) {
		return {};
	}

	const [command, ...rest] = normalized.split(/\s+/u);
	if (command !== "apply-global" && command !== "apply-project") {
		return {};
	}

	const rawSelection = rest.join(" ").trim();
	return {
		applyScope: command === "apply-project" ? "project" : "global",
		selectedIds:
			!rawSelection || rawSelection === "all" ? undefined : rawSelection.split(/[\s,]+/u).map((id) => id.trim()).filter(Boolean),
	};
}

async function promptForSuggestionSelection(
	ctx: ExtensionContext,
	review: IntentReviewResult,
	scope: IntentReviewSuggestionScope,
): Promise<string[] | undefined> {
	const approvable = getApprovableIntentSuggestions(review);
	if (approvable.length === 0) {
		return [];
	}

	const prefill = approvable.map((suggestion) => suggestion.id).join("\n");
	const edited = await ctx.ui.editor(`Apply ${scope} intent suggestions (one id per line)`, prefill);
	if (edited === undefined) {
		return undefined;
	}

	return edited
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter(Boolean);
}

function formatApplySummary(scope: IntentReviewSuggestionScope, result: ReturnType<typeof applyIntentReviewSuggestions>): string {
	return `# Intent Review Apply\n\n- scope: ${scope}\n- applied: ${result.appliedCount}\n- skipped: ${result.skippedCount}\n- file: ${result.path}\n- ids: ${result.appliedIds.join(", ") || "(none)"}`;
}

async function maybeApplyReviewInteractively(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	review: IntentReviewResult,
): Promise<void> {
	const approvable = getApprovableIntentSuggestions(review);
	if (!ctx.hasUI || approvable.length === 0) {
		return;
	}

	const choice = await ctx.ui.select("Intent review complete. What next?", [
		"Review only",
		"Apply selected globally",
		"Apply selected to project",
	]);
	if (choice !== "Apply selected globally" && choice !== "Apply selected to project") {
		return;
	}

	const scope: IntentReviewSuggestionScope = choice.includes("project") ? "project" : "global";
	const selectedIds = await promptForSuggestionSelection(ctx, review, scope);
	if (selectedIds === undefined) {
		ctx.ui.notify("Intent apply cancelled", "info");
		return;
	}

	const applyResult = applyIntentReviewSuggestions(review, { cwd: ctx.cwd, scope, selectedIds });
	pi.sendMessage(
		{
			customType: "intent-review-apply-report",
			content: formatApplySummary(scope, applyResult),
			display: true,
		},
		{ triggerTurn: false },
	);
	ctx.ui.notify(`Applied ${applyResult.appliedCount} intent heuristic suggestion(s)`, "info");
}

async function generateIntentReview(ctx: ExtensionContext, signal?: AbortSignal): Promise<IntentReviewResult> {
	const model = ctx.model;
	if (!model) {
		throw new Error("No model selected");
	}

	const stats = readIntentStatsFile();
	const payload = buildIntentReviewPayload(stats);
	if (payload.sampleCount < 5 || payload.strongCandidates.length + payload.highMismatchFeatures.length === 0) {
		throw new Error("Not enough collected evidence yet. Run /intent-collect across more sessions first.");
	}

	const auth = await resolveModelAuth(ctx);
	const userMessage: Message = {
		role: "user",
		content: [{ type: "text", text: buildIntentReviewUserMessage(stats) }],
		timestamp: Date.now(),
	};

	const response = await complete(
		model,
		{ systemPrompt: INTENT_REVIEW_SYSTEM_PROMPT, messages: [userMessage] },
		{ apiKey: auth.apiKey, headers: auth.headers, signal: signal ?? ctx.signal },
	);

	if (response.stopReason === "aborted") {
		throw new Error("Intent review cancelled");
	}

	const text = response.content
		.filter((content): content is { type: "text"; text: string } => content.type === "text")
		.map((content) => content.text)
		.join("\n")
		.trim();

	return parseIntentReviewResult(text);
}

export default function intentReview(pi: ExtensionAPI) {
	pi.registerCommand("intent-review", {
		description: "Review aggregate intent stats with the current model",
		handler: async (args, ctx) => {
			if (!requireModel(ctx)) {
				return;
			}

			const command = parseReviewCommandArgs(args);
			let review: IntentReviewResult | undefined;
			let reviewError: string | undefined;
			try {
				if (ctx.hasUI) {
					review = await ctx.ui.custom<IntentReviewResult | undefined>((tui, theme, _kb, done) => {
						const loader = new BorderedLoader(tui, theme, "Reviewing intent stats...");
						loader.onAbort = () => done(undefined);
						generateIntentReview(ctx, loader.signal)
							.then(done)
							.catch((error) => {
								reviewError = error instanceof Error ? error.message : String(error);
								done(undefined);
							});
						return loader;
					});
				} else {
					review = await generateIntentReview(ctx);
				}
			} catch (error) {
				if (ctx.hasUI) {
					ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				}
				return;
			}

			if (!review) {
				if (ctx.hasUI) {
					ctx.ui.notify(reviewError ?? "Intent review cancelled", reviewError ? "error" : "info");
				}
				return;
			}

			pi.appendEntry("intent-review", {
				generatedAt: new Date().toISOString(),
				review,
			});

			pi.sendMessage(
				{
					customType: "intent-review-report",
					content: formatIntentReviewResult(review),
					display: true,
				},
				{ triggerTurn: false },
			);

			if (command.applyScope) {
				const applyResult = applyIntentReviewSuggestions(review, {
					cwd: ctx.cwd,
					scope: command.applyScope,
					selectedIds: command.selectedIds,
				});
				pi.sendMessage(
					{
						customType: "intent-review-apply-report",
						content: formatApplySummary(command.applyScope, applyResult),
						display: true,
					},
					{ triggerTurn: false },
				);
				if (ctx.hasUI) {
					ctx.ui.notify(`Applied ${applyResult.appliedCount} intent heuristic suggestion(s)`, "info");
				}
				return;
			}

			await maybeApplyReviewInteractively(pi, ctx, review);
		},
	});
}
