import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { extractTodoSnapshotFromCustomEntry, type TodoSnapshot } from "../../tools/todo-state.js";
import { hasUnfinishedPlanWork, initializePlanExecution, loadPlanArtifact, resumePlanExecution } from "./shared.js";

const ExecutePlanParams = Type.Object({
	path: Type.String({ description: "Path to a markdown plan artifact containing a numbered Plan: section" }),
	resume: Type.Optional(
		Type.Boolean({ description: "Resume matching completed steps from existing execution state" }),
	),
});

function summarizeExecution(result: ReturnType<typeof initializePlanExecution>): string {
	const unfinished = result.todos.filter((todo) => todo.status === "pending" || todo.status === "in_progress").length;
	return `Initialized plan execution from ${result.plan.path ?? "inline plan"} with ${result.todos.length} step(s); ${unfinished} active`;
}

export default function planExecutionExtension(pi: ExtensionAPI): void {
	let latestExecution: TodoSnapshot | undefined;

	const rebuildFromSession = (ctx: { sessionManager: { getBranch(): any[] } }) => {
		latestExecution = undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom") {
				const customSnapshot = extractTodoSnapshotFromCustomEntry(entry.customType, entry.data);
				if (customSnapshot) latestExecution = customSnapshot;
			}
			if (entry.type === "message") {
				const msg = entry.message;
				if (msg.role === "toolResult" && msg.toolName === "execute_plan") {
					const details = msg.details as
						| { todos?: TodoSnapshot["todos"]; summary?: TodoSnapshot["summary"] }
						| undefined;
					if (details?.todos && details.summary) {
						latestExecution = { todos: details.todos, summary: details.summary };
					}
				}
			}
		}
	};

	pi.on("session_start", async (_event, ctx) => rebuildFromSession(ctx));
	pi.on("session_tree", async (_event, ctx) => rebuildFromSession(ctx));

	pi.registerTool({
		name: "execute_plan",
		label: "Execute Plan",
		description:
			"Load a plan artifact, convert it into structured execution state, and initialize/resume tracked progress.",
		promptSnippet: "Initialize or resume structured execution from a markdown plan artifact",
		promptGuidelines: [
			"Use execute_plan when a plan artifact should become active tracked execution state.",
			"Resume existing plan progress with execute_plan path=... resume=true instead of rewriting the todo list manually.",
		],
		parameters: ExecutePlanParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const plan = loadPlanArtifact(params.path, ctx.cwd);
			const result = params.resume ? initializePlanExecution(plan, latestExecution) : initializePlanExecution(plan);
			latestExecution = { todos: result.todos, summary: result.summary };
			return {
				content: [{ type: "text", text: summarizeExecution(result) }],
				details: {
					...result,
					unfinished: hasUnfinishedPlanWork(resumePlanExecution(plan, latestExecution)),
				},
			};
		},
		renderCall(args, theme) {
			return new Text(`${theme.fg("toolTitle", theme.bold("execute_plan"))} ${theme.fg("accent", args.path)}`, 0, 0);
		},
		renderResult(result, _options, theme) {
			const text = result.content.find((block) => block.type === "text")?.text ?? "";
			return new Text(theme.fg("toolOutput", text), 0, 0);
		},
	});

	pi.registerCommand("execute-plan", {
		description: "Initialize tracked execution from a markdown plan artifact: /execute-plan path/to/plan.md",
		handler: async (args, ctx) => {
			const planPath = args.trim();
			if (!planPath) {
				ctx.ui.notify("Usage: /execute-plan path/to/plan.md", "error");
				return;
			}
			const plan = loadPlanArtifact(planPath, ctx.cwd);
			const result = initializePlanExecution(plan, latestExecution);
			latestExecution = { todos: result.todos, summary: result.summary };
			pi.appendEntry("plan-execution-state", {
				plan: result.plan,
				todos: result.todos,
				summary: result.summary,
			});
			pi.sendMessage(
				{
					customType: "plan-execution-init",
					content: summarizeExecution(result),
					display: true,
					details: result,
				},
				{ triggerTurn: false },
			);
		},
	});
}
