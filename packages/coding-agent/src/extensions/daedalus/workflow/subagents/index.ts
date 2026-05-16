import { StringEnum } from "@daedalus-pi/ai";
import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { getAgentDir } from "../../../../config.js";
import { discoverSubagents } from "../../../../core/subagents/index.js";
import { getBundledStarterAgents } from "./bundled.js";
import { buildInspectorOptions, formatInspectorLabel, openSubagentInspector } from "./inspect.js";
import { buildSubagentNavigationModel, formatSubagentNavigationStatus } from "./navigation.js";
import { getOrchestratorGuidance } from "./orchestrator-prompt.js";
import { formatTaskProgress } from "./task-progress-renderer.js";

interface SubagentToolDetails {
	runId?: string;
	resultId?: string;
	agent: string;
	goal: string;
	task?: string;
	conversationId?: string;
	status: "running" | "completed" | "partial" | "blocked" | "failed" | "aborted";
	summary: string;
	output?: string;
	reference?: unknown;
	activity?: string;
	recentActivity?: string[];
	childSessionFile?: string;
	contextArtifactPath?: string;
	resultArtifactPath?: string;
	error?: string;
	taskBinding?: {
		type: "plan-task";
		planPath: string;
		taskId: string;
		taskTitle?: string;
		files?: string[];
	};
	isolation?: string;
	workspaceTarget?: {
		cwd?: string;
		branch?: string;
		isolationMode?: string;
		baseBranch?: string;
		baseCommit?: string;
	};
	workspaceMetadata?: {
		isolation?: string;
		baseBranch?: string;
		baseCommit?: string;
		mergeBack?: string;
		mergeBackArtifactPath?: string;
		mergeBackBranch?: string;
	};
	mergeBackResult?: { artifactPath?: string; branchName?: string; policy?: string; status?: string; message?: string };
}

function truncate(text: string, max = 72): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (!clean) return "";
	if (clean.length <= max) return clean;
	return `${clean.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function formatPathTail(value: string): string {
	const parts = value.split("/").filter(Boolean);
	return parts.length > 2 ? parts.slice(-2).join("/") : value;
}

function extractExecutablePlanHandoff(summary?: string, output?: string): Record<string, string | boolean> {
	const text = [summary, output].filter(Boolean).join("\n");
	if (!text) return {};
	const handoff: Record<string, string | boolean> = {};
	const planPath = text.match(/(?:^|[\n\s`{,])plan_path[`"']?\s*[:=]\s*[`"']?([^`"'\s,}]+)/i)?.[1];
	if (planPath) handoff.plan_path = planPath;
	const validated = text.match(/(?:^|[\n\s`{,])validated[`"']?\s*[:=]\s*[`"']?(true|false)/i)?.[1];
	if (validated) handoff.validated = validated.toLowerCase() === "true";
	const recommendedParentAction = text.match(
		/(?:^|\n)\s*recommended_parent_action\s*:\s*(.+?)(?=\n\s*\w[\w-]*\s*:|$)/is,
	)?.[1];
	if (recommendedParentAction) handoff.recommended_parent_action = truncate(recommendedParentAction, 240);
	return handoff;
}

function formatCallMetadata(args: { isolation?: string; merge_back?: string; base_branch?: string }): string[] {
	const parts: string[] = [];
	if (args.isolation) parts.push(`isolation ${args.isolation}`);
	if (args.merge_back) parts.push(`merge_back ${args.merge_back}`);
	if (args.base_branch) parts.push(`base ${args.base_branch}`);
	return parts;
}

function formatResultMetadata(details: SubagentToolDetails): { inline: string[]; detail: string[] } {
	const requestedIsolation = details.isolation;
	const effectiveIsolation = details.workspaceMetadata?.isolation ?? details.workspaceTarget?.isolationMode;
	const mergeBackPolicy = details.mergeBackResult?.policy ?? details.workspaceMetadata?.mergeBack;
	const mergeBackStatus = details.mergeBackResult?.status;
	const inline: string[] = [];
	const detail: string[] = [];

	if (requestedIsolation) inline.push(`isolation ${requestedIsolation}`);
	if (effectiveIsolation && effectiveIsolation !== requestedIsolation) inline.push(`effective ${effectiveIsolation}`);
	if (mergeBackPolicy) {
		inline.push(`merge_back ${mergeBackStatus ? `${mergeBackPolicy} · ${mergeBackStatus}` : mergeBackPolicy}`);
	} else if (mergeBackStatus) {
		inline.push(`merge_back ${mergeBackStatus}`);
	}

	const branchName = details.mergeBackResult?.branchName ?? details.workspaceMetadata?.mergeBackBranch;
	if (branchName) detail.push(`branch ${branchName}`);
	const artifactPath = details.mergeBackResult?.artifactPath ?? details.workspaceMetadata?.mergeBackArtifactPath;
	if (artifactPath) detail.push(`artifact ${formatPathTail(artifactPath)}`);
	return { inline, detail };
}

function renderSubagentCall(
	args: {
		agent?: string;
		goal?: string;
		assignment?: string;
		isolation?: string;
		merge_back?: string;
		base_branch?: string;
	},
	theme: any,
): Text {
	const agent = args.agent || "subagent";
	let text = theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", agent);
	if (args.goal) {
		text += theme.fg("muted", ` · ${truncate(args.goal, 56)}`);
	}
	const metadata = formatCallMetadata(args);
	if (metadata.length > 0) {
		text += theme.fg("muted", ` · ${metadata.join(" · ")}`);
	}
	if (args.assignment) {
		text += `\n  ${theme.fg("dim", truncate(args.assignment, 88))}`;
	}
	return new Text(text, 0, 0);
}

function renderSubagentResult(
	result: { content: Array<{ type: string; text?: string }>; details?: unknown },
	options: { isPartial: boolean },
	theme: any,
	context: { state: Record<string, unknown> },
): Text {
	delete context.state.primaryActionData;
	delete context.state.primaryActionLabel;

	const details = result.details as SubagentToolDetails | undefined;
	if (!details) {
		const text = result.content[0];
		return new Text(text?.type === "text" ? text.text || "(no output)" : "(no output)", 0, 0);
	}

	const running = options.isPartial || details.status === "running";
	const icon = running
		? theme.fg("warning", "⋯")
		: details.status === "completed"
			? theme.fg("success", "✓")
			: details.status === "partial"
				? theme.fg("warning", "~")
				: theme.fg("error", "✗");
	let text = `${icon} ${theme.fg("accent", details.agent)}`;
	text += theme.fg("muted", ` · ${truncate(details.goal, 64)}`);
	const metadata = formatResultMetadata(details);
	if (metadata.inline.length > 0) {
		text += theme.fg("muted", ` · ${metadata.inline.join(" · ")}`);
	}

	if (running) {
		if (details.activity) {
			text += `\n  ${theme.fg("toolOutput", truncate(details.activity, 92))}`;
		} else {
			text += `\n  ${theme.fg("dim", "working...")}`;
		}
		const previous = (details.recentActivity ?? [])
			.filter((activity) => activity && activity !== details.activity)
			.slice(-2);
		for (const activity of previous) {
			text += `\n  ${theme.fg("dim", `↳ ${truncate(activity, 88)}`)}`;
		}
		if (details.childSessionFile || details.runId) {
			context.state.primaryActionData = { toolName: "subagent", details };
			context.state.primaryActionLabel = "Inspect";
			text += `\n  ${theme.fg("accent", "Inspect (Enter · Ctrl+Alt+I to cycle)")}`;
		}
		return new Text(text, 0, 0);
	}

	text += `\n  ${theme.fg(details.status === "completed" ? "toolOutput" : "error", truncate(details.summary, 92))}`;
	if (details.error) {
		text += `\n  ${theme.fg("error", truncate(details.error, 92))}`;
	}
	for (const line of metadata.detail) {
		text += `\n  ${theme.fg("dim", truncate(line, 92))}`;
	}
	if (details.childSessionFile || details.runId) {
		context.state.primaryActionData = { toolName: "subagent", details };
		context.state.primaryActionLabel = "Inspect";
		text += `\n  ${theme.fg("accent", "Inspect (Enter · Ctrl+Alt+I to cycle)")}`;
	}
	return new Text(text, 0, 0);
}

export default function subagentStarterPack(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: "Run a bundled or discovered subagent with a compact task packet.",
		promptSnippet: "Delegate a focused sub-task to an available specialist.",
		promptGuidelines: [
			"Do not launch subagents for initial codebase exploration or simple lookups. Use sem_search first.",
			"This exploration limit does not override role routing: use Muse for plans and always use Worker for implementation after minimal grounding.",
			"When launching multiple independent tasks, call subagent once per independent task in parallel (single assistant message, multiple tool calls).",
			`During executable-plan execution, prefer one Worker per ready task and pass taskBinding with the plan path, task id, title, and file list. Example: {"type":"plan-task","planPath":"docs/plans/2026_05_16/example.plan.json","taskId":"T-1","taskTitle":"Implement focused change","files":["packages/coding-agent/src/file.ts"]}.`,
			"Use Reviewer for whole-plan/final review by default; only dispatch a task-bound Reviewer for risky tasks that need focused review.",
			"Keep Daedalus summary-first result semantics: inspect the returned summary/reference first and read deferred full output only when needed.",
			`Use isolation:"inherit" for the parent cwd without child workspace metadata; isolation:"shared" for the parent cwd with shared workspace metadata; isolation:"worktree" for a dedicated managed worktree.`,
			`Use isolation:"worktree" for implementation, risky edits, or parallel mutations that should not touch the parent checkout.`,
			`For worktree isolation, merge_back defaults to "patch"; use merge_back:"patch" to apply a clean child diff back to the parent, or merge_back:"branch" to create a task branch for review.`,
			`Use base_branch with worktree isolation to choose the base branch/ref; omit it to let Daedalus resolve the current/base target.`,
		],
		parameters: Type.Object({
			agent: Type.String(),
			goal: Type.String(),
			assignment: Type.String(),
			context: Type.Optional(Type.String()),
			conversation_id: Type.Optional(Type.String()),
			isolation: Type.Optional(
				Type.Union([Type.Literal("inherit"), Type.Literal("shared"), Type.Literal("worktree")], {
					description: `Use "inherit" for the parent cwd without child workspace metadata, "shared" for parent cwd with shared workspace metadata, or "worktree" for a dedicated managed worktree.`,
				}),
			),
			merge_back: Type.Optional(
				Type.Union([Type.Literal("patch"), Type.Literal("branch")], {
					description: `Worktree merge-back policy. Defaults to "patch" for worktree isolation; use "patch" for a clean diff apply-back or "branch" to create a task branch for review.`,
				}),
			),
			base_branch: Type.Optional(
				Type.String({
					description:
						"With worktree isolation, choose the base branch/ref; omit it to let Daedalus resolve the current/base target.",
				}),
			),
			taskBinding: Type.Optional(
				Type.Object(
					{
						type: StringEnum(["plan-task"] as const, {
							description: `Discriminator for executable-plan task bindings. Must be exactly "plan-task".`,
						}),
						planPath: Type.String({
							description: "Repository-relative path to the executable .plan.json that owns this task.",
						}),
						taskId: Type.String({
							description: "Stable id of the plan task being delegated, copied exactly from the plan file.",
						}),
						taskTitle: Type.Optional(
							Type.String({
								description:
									"Human-readable title of the delegated plan task, copied from the plan when available.",
							}),
						),
						files: Type.Optional(
							Type.Array(Type.String(), {
								description: "Repository-relative files expected to be relevant for the delegated plan task.",
							}),
						),
					},
					{
						description:
							"Executable-plan binding for task-scoped subagents. Include when delegating a specific plan task so the child can call plan_task_read for its bound packet.",
					},
				),
			),
		}),
		renderCall: (args, theme) => renderSubagentCall(args, theme),
		renderResult: (result, options, theme, context) => renderSubagentResult(result, options, theme, context),
		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const parentSessionFile = ctx.sessionManager.getSessionFile();
			if (!parentSessionFile) {
				throw new Error("Subagent runs require a persisted parent session.");
			}

			const { agents } = await discoverSubagents({
				cwd: ctx.cwd,
				agentDir: getAgentDir(),
				bundled: getBundledStarterAgents(),
			});
			const agent = agents.find((candidate) => candidate.name === params.agent);
			if (!agent) {
				throw new Error(`Unknown subagent: ${params.agent}`);
			}

			const result = await pi.runSubagent({
				agent,
				parentSessionFile,
				goal: params.goal,
				assignment: params.assignment,
				context: params.context,
				conversationId: params.conversation_id,
				isolation: params.isolation,
				mergeBack: params.merge_back,
				baseBranch: params.base_branch,
				taskBinding: params.taskBinding,
				workspaceTarget: ctx.workspaceTarget,
				onProgress: (progress) => {
					onUpdate?.({
						content: [
							{
								type: "text",
								text: formatTaskProgress({
									agent: progress.agent,
									status: progress.status,
									summary: progress.summary,
									activity: progress.activity,
								}),
							},
						],
						details: {
							agent: progress.agent,
							goal: params.goal,
							status: progress.status,
							summary: progress.summary,
							activity: progress.activity,
							recentActivity: progress.recentActivity,
							childSessionFile: progress.childSessionFile,
							contextArtifactPath: progress.contextArtifactPath,
							runId: progress.runId,
							workspaceTarget: progress.workspaceTarget,
							taskBinding: progress.taskBinding,
						} satisfies SubagentToolDetails,
					});
				},
			});

			const extractedHandoff = extractExecutablePlanHandoff(result.summary, result.output);
			const baseReference =
				result.reference && typeof result.reference === "object" && !Array.isArray(result.reference)
					? result.reference
					: {
							result_id: result.resultId ?? result.runId,
							agent_id: result.agent,
							conversation_id: result.conversationId ?? result.childSessionFile,
							task: result.task ?? params.goal,
							status: result.status,
							summary: result.summary,
							note: `If you want the full output, use read_agent_result_output(${result.resultId ?? result.runId}).`,
						};
			const visibleReference = { ...baseReference, ...extractedHandoff };
			const visibleContent = JSON.stringify(visibleReference);

			return {
				content: [{ type: "text", text: visibleContent }],
				details: {
					agent: result.agent,
					goal: params.goal,
					task: result.task,
					status: result.status,
					summary: result.summary,
					output: result.output,
					reference: visibleReference,
					resultId: result.resultId,
					conversationId: result.conversationId,
					runId: result.runId,
					childSessionFile: result.childSessionFile,
					contextArtifactPath: result.contextArtifactPath,
					resultArtifactPath: result.resultArtifactPath,
					error: result.error,
					workspaceTarget: result.workspaceTarget,
					isolation: result.isolation,
					workspaceMetadata: result.workspaceMetadata,
					mergeBackResult: result.mergeBackResult,
					taskBinding: result.taskBinding,
				} satisfies SubagentToolDetails,
			};
		},
	});

	pi.registerCommand("agents", {
		description: "List bundled starter-pack agents",
		handler: async (_args, ctx) => {
			const { agents } = await discoverSubagents({
				cwd: ctx.cwd,
				agentDir: getAgentDir(),
				bundled: getBundledStarterAgents(),
			});
			ctx.ui.notify(`agents: ${agents.map((agent) => agent.name).join(", ")}`);
		},
	});

	pi.registerCommand("subagents", {
		description: "Inspect active and persisted subagent runs for this session",
		handler: async (_args, ctx) => {
			const runs = buildInspectorOptions(pi.getActiveSubagentRuns(), await pi.listSubagentRuns());
			if (runs.length === 0) {
				ctx.ui.notify("No subagent runs recorded yet.", "info");
				return;
			}
			const selectedLabel = await ctx.ui.select("Inspect subagent run", runs.map(formatInspectorLabel));
			const selected = runs.find((run) => formatInspectorLabel(run) === selectedLabel);
			if (selected) {
				await openSubagentInspector(ctx, selected);
			}
		},
	});

	async function navigateSubagent(kind: "parent" | "previous" | "next", ctx: any): Promise<void> {
		const model = buildSubagentNavigationModel({
			runs: buildInspectorOptions(pi.getActiveSubagentRuns(), await pi.listSubagentRuns()),
			currentSessionFile: ctx.sessionManager.getSessionFile(),
			currentEntries: ctx.sessionManager.getEntries?.(),
		});
		ctx.ui.setStatus?.("subagents", formatSubagentNavigationStatus(model));
		const target = kind === "parent" ? model.parent : kind === "previous" ? model.previous : model.next;
		if (!target) {
			ctx.ui.notify(`No subagent ${kind} session available.`, "info");
			return;
		}
		await ctx.switchSession(target.sessionFile);
	}

	pi.registerCommand("subagent_parent", {
		description: "Switch from a child subagent session back to its parent",
		handler: async (_args, ctx) => navigateSubagent("parent", ctx),
	});
	pi.registerCommand("subagent_prev", {
		description: "Switch to the previous sibling subagent session",
		handler: async (_args, ctx) => navigateSubagent("previous", ctx),
	});
	pi.registerCommand("subagent_next", {
		description: "Switch to the next sibling subagent session",
		handler: async (_args, ctx) => navigateSubagent("next", ctx),
	});

	pi.on("session_start", async () => {
		const next = new Set(pi.getActiveTools());
		next.add("subagent");
		pi.setActiveTools(Array.from(next));
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const { agents } = await discoverSubagents({
			cwd: ctx.cwd,
			agentDir: getAgentDir(),
			bundled: getBundledStarterAgents(),
		});

		return {
			systemPrompt: `${event.systemPrompt}\n\n${getOrchestratorGuidance(agents)}`,
		};
	});
}
