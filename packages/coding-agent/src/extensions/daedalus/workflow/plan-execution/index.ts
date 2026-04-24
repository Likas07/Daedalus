import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { extractTodoSnapshotFromCustomEntry, type TodoSnapshot } from "../../tools/todo-state.js";
import {
	findPlanStepBySelector,
	formatPlanStepDetail,
	hasUnfinishedPlanWork,
	initializePlanExecution,
	loadPlanArtifact,
	readyParallelGroups,
	resumePlanExecution,
	type PlanExecutionState,
} from "./shared.js";

const ExecutePlanParams = Type.Object({
	path: Type.String({ description: "Path to a markdown plan artifact containing a numbered Plan: section" }),
	resume: Type.Optional(
		Type.Boolean({ description: "Resume matching completed steps from existing execution state" }),
	),
});

const PlanTaskReadParams = Type.Object({
	selector: Type.Optional(Type.String({ description: "Task id, step number, active, or next (default: active)" })),
});

function summarizeExecution(result: ReturnType<typeof initializePlanExecution>): string {
	const unfinished = result.todos.filter((todo) => todo.status === "pending" || todo.status === "in_progress").length;
	const active = result.todos.find((todo) => todo.status === "in_progress");
	const state = { plan: result.plan, todos: result.todos, summary: result.summary };
	const readyGroups = readyParallelGroups(state);
	const firstGroup = readyGroups[0];
	return [
		`Initialized plan execution from ${result.plan.path ?? "inline plan"} with ${result.todos.length} task(s); ${unfinished} active`,
		active ? `Active: ${active.content}` : undefined,
		firstGroup ? `Ready parallel group ${firstGroup.group}: ${firstGroup.steps.map((step) => step.id).join(", ")}` : undefined,
		"Use plan_task_read selector=active for the current task details instead of reading the full plan file.",
	]
		.filter(Boolean)
		.join("\n");
}

export default function planExecutionExtension(pi: ExtensionAPI): void {
	let latestExecution: PlanExecutionState | undefined;

	const rebuildFromSession = (ctx: { sessionManager: { getBranch(): any[] } }) => {
		latestExecution = undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom") {
				const customSnapshot = extractTodoSnapshotFromCustomEntry(entry.customType, entry.data);
				if (customSnapshot && (entry.data as any)?.plan) {
					latestExecution = { ...(customSnapshot as TodoSnapshot), plan: (entry.data as any).plan };
				}
			}
			if (entry.type === "message") {
				const msg = entry.message;
				if (msg.role === "toolResult" && msg.toolName === "execute_plan") {
					const details = msg.details as PlanExecutionState | undefined;
					if (details?.todos && details.summary && details.plan) {
						latestExecution = { todos: details.todos, summary: details.summary, plan: details.plan };
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
			latestExecution = { plan: result.plan, todos: result.todos, summary: result.summary };
			return {
				content: [{ type: "text", text: summarizeExecution(result) }],
				details: {
					...latestExecution,
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

	pi.registerTool({
		name: "plan_task_read",
		label: "Plan Task Read",
		description: "Read one task packet from the active structured plan without loading the full plan artifact.",
		promptSnippet: "Read the active or selected task details from the current execution plan",
		promptGuidelines: [
			"Use plan_task_read after execute_plan instead of reading the full plan file again.",
			"Request selector=active for the current in-progress task, or selector=next for the next pending task.",
		],
		parameters: PlanTaskReadParams,
		async execute(_toolCallId, params) {
			if (!latestExecution) {
				return {
					content: [{ type: "text", text: "No active plan execution. Run execute_plan first." }],
					isError: true,
					details: undefined,
				};
			}
			const step = findPlanStepBySelector(latestExecution, params.selector ?? "active");
			if (!step) {
				return {
					content: [{ type: "text", text: `No plan task found for selector: ${params.selector ?? "active"}` }],
					isError: true,
					details: latestExecution,
				};
			}
			return { content: [{ type: "text", text: formatPlanStepDetail(step) }], details: { step, plan: latestExecution.plan } };
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
			latestExecution = { plan: result.plan, todos: result.todos, summary: result.summary };
			pi.appendEntry("plan-execution-state", latestExecution);
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
