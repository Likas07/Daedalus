import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { getAgentDir } from "../../../../config.js";
import { discoverSubagents } from "../../../../core/subagents/index.js";
import { getBundledStarterAgents } from "./bundled.js";
import { buildInspectorOptions, formatInspectorLabel, openSubagentInspector } from "./inspect.js";
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
}

function truncate(text: string, max = 72): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (!clean) return "";
	if (clean.length <= max) return clean;
	return `${clean.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function renderSubagentCall(args: { agent?: string; goal?: string; assignment?: string }, theme: any): Text {
	const agent = args.agent || "subagent";
	let text = theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", agent);
	if (args.goal) {
		text += theme.fg("muted", ` · ${truncate(args.goal, 56)}`);
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
			"When launching multiple independent tasks, call subagent once per independent task in parallel (single assistant message, multiple tool calls).",
			"Keep Daedalus summary-first result semantics: inspect the returned summary/reference first and read deferred full output only when needed.",
		],
		parameters: Type.Object({
			agent: Type.String(),
			goal: Type.String(),
			assignment: Type.String(),
			context: Type.Optional(Type.String()),
			conversation_id: Type.Optional(Type.String()),
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
						} satisfies SubagentToolDetails,
					});
				},
			});

			const visibleContent = JSON.stringify(
				result.reference ?? {
					result_id: result.resultId ?? result.runId,
					agent_id: result.agent,
					conversation_id: result.conversationId ?? result.childSessionFile,
					task: result.task ?? params.goal,
					status: result.status,
					summary: result.summary,
					note: `If you want the full output, use read_agent_result_output(${result.resultId ?? result.runId}).`,
				},
			);

			return {
				content: [{ type: "text", text: visibleContent }],
				details: {
					agent: result.agent,
					goal: params.goal,
					task: result.task,
					status: result.status,
					summary: result.summary,
					output: result.output,
					reference: result.reference,
					resultId: result.resultId,
					conversationId: result.conversationId,
					runId: result.runId,
					childSessionFile: result.childSessionFile,
					contextArtifactPath: result.contextArtifactPath,
					resultArtifactPath: result.resultArtifactPath,
					error: result.error,
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

	pi.on("session_start", async () => {
		const next = new Set(pi.getActiveTools());
		next.add("subagent");
		pi.setActiveTools(Array.from(next));
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		const { agents } = await discoverSubagents({
			cwd: ctx.cwd,
			agentDir: getAgentDir(),
			bundled: getBundledStarterAgents(),
		});

		return {
			message: {
				customType: "daedalus-orchestrator",
				content: [{ type: "text", text: getOrchestratorGuidance(agents) }],
				display: false,
			},
		};
	});
}
