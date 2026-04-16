import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Type } from "@sinclair/typebox";
import { getAgentDir } from "../../../../config.js";
import { discoverSubagents } from "../../../../core/subagents/index.js";
import { getBundledStarterAgents } from "./bundled.js";
import { restoreSubagentMode } from "./state.js";
import { showSubagentTranscript } from "./viewer.js";

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
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
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
			});

			return {
				content: [{ type: "text", text: result.summary }],
				details: result,
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
			const combined = [...pi.getActiveSubagentRuns(), ...(await pi.listSubagentRuns())];
			if (combined.length === 0) {
				ctx.ui.notify("No subagent runs recorded yet.", "info");
				return;
			}
			const choice = await ctx.ui.select(
				"Inspect subagent run",
				combined.map((run) => `${run.agent} :: ${run.summary}`),
			);
			const selected = combined.find((run) => `${run.agent} :: ${run.summary}` === choice);
			if (selected?.childSessionFile) {
				await showSubagentTranscript(ctx, selected.childSessionFile);
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
							"[ORCHESTRATOR MODE ACTIVE]",
							"Default to delegation.",
							"Use subagent for scout/planner/worker/reviewer.",
							"Pass compact task packets, never the full transcript.",
						].join("\n"),
					},
				],
				display: false,
			},
		};
	});
}
