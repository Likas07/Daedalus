import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { getAgentDir } from "../../../../config.js";
import { discoverSubagents } from "../../../../core/subagents/index.js";
import { getBundledStarterAgents } from "./bundled.js";
import { buildInspectorOptions, formatInspectorLabel, openSubagentArtifacts } from "./inspect.js";
import { restoreSubagentMode } from "./state.js";

interface SubagentToolDetails {
	runId?: string;
	agent: string;
	goal: string;
	status: "running" | "completed" | "failed" | "aborted";
	summary: string;
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
): Text {
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
		return new Text(text, 0, 0);
	}

	text += `\n  ${theme.fg(details.status === "completed" ? "toolOutput" : "error", truncate(details.summary, 92))}`;
	if (details.error) {
		text += `\n  ${theme.fg("error", truncate(details.error, 92))}`;
	}
	return new Text(text, 0, 0);
}

export default function subagentStarterPack(pi: ExtensionAPI): void {
	let orchestratorEnabled = false;
	let baseToolNames: string[] = [];

	const persistMode = () => {
		pi.appendEntry("subagent-mode", { enabled: orchestratorEnabled });
	};

	const syncToolState = () => {
		const next = new Set(baseToolNames.length > 0 ? baseToolNames : pi.getActiveTools());
		if (orchestratorEnabled) {
			next.add("subagent");
		} else {
			next.delete("subagent");
		}
		pi.setActiveTools(Array.from(next));
	};

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: "Run a bundled or discovered subagent with a compact task packet.",
		parameters: Type.Object({
			agent: Type.String(),
			goal: Type.String(),
			assignment: Type.String(),
			context: Type.Optional(Type.String()),
		}),
		renderCall: (args, theme) => renderSubagentCall(args, theme),
		renderResult: (result, options, theme) => renderSubagentResult(result, options, theme),
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
				onProgress: (progress) => {
					onUpdate?.({
						content: [{ type: "text", text: progress.activity ?? `${progress.agent} is working...` }],
						details: {
							agent: progress.agent,
							goal: params.goal,
							status: progress.status,
							summary: progress.summary,
							activity: progress.activity,
							recentActivity: progress.recentActivity,
							childSessionFile: progress.childSessionFile,
							contextArtifactPath: progress.contextArtifactPath,
						} satisfies SubagentToolDetails,
					});
				},
			});

			return {
				content: [{ type: "text", text: result.summary }],
				details: {
					agent: result.agent,
					goal: params.goal,
					status: result.status,
					summary: result.summary,
					runId: result.runId,
					childSessionFile: result.childSessionFile,
					contextArtifactPath: result.contextArtifactPath,
					resultArtifactPath: result.resultArtifactPath,
					error: result.error,
				} satisfies SubagentToolDetails,
			};
		},
	});

	pi.registerCommand("orchestrator", {
		description: "Enable or disable orchestrator mode",
		handler: async (args, ctx) => {
			const normalized = args.trim();
			if (normalized === "status") {
				ctx.ui.notify(`orchestrator: ${orchestratorEnabled ? "on" : "off"}`);
				return;
			}
			if (normalized === "on") orchestratorEnabled = true;
			if (normalized === "off") orchestratorEnabled = false;
			syncToolState();
			persistMode();
			ctx.ui.notify(`orchestrator: ${orchestratorEnabled ? "on" : "off"}`);
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
				await openSubagentArtifacts(ctx, selected);
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		baseToolNames = pi.getActiveTools().filter((name) => name !== "subagent");
		orchestratorEnabled = restoreSubagentMode(ctx).enabled;
		syncToolState();
	});

	pi.on("before_agent_start", async () => {
		if (!orchestratorEnabled) return;
		return {
			message: {
				customType: "orchestrator-mode",
				content: [
					{
						type: "text",
						text: [
							"[ORCHESTRATOR MODE]",
							"Delegate focused work to scout/planner/worker/reviewer.",
							"Send compact assignments, not the full transcript.",
						].join("\n"),
					},
				],
				display: false,
			},
		};
	});
}
