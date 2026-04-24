import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import {
	type ExecutablePlanV1,
	markdownHash,
	planSidecarPath,
	validateExecutablePlan,
	writeExecutablePlanFiles,
} from "./schema.js";

const ExecutePlanParams = Type.Object({
	path: Type.String({ description: "Path to a markdown plan artifact containing a numbered Plan: section" }),
	resume: Type.Optional(
		Type.Boolean({ description: "Resume matching completed steps from existing execution state" }),
	),
});

const PlanTaskReadParams = Type.Object({
	selector: Type.Optional(Type.String({ description: "Task id, step number, active, or next (default: active)" })),
});

const PlanCreateParams = Type.Object({
	path: Type.String({ description: "Output markdown path under docs/plans, ending in .md" }),
	title: Type.String(),
	goal: Type.String(),
	architecture: Type.String(),
	tech_stack: Type.Array(Type.String()),
	tasks: Type.Array(
		Type.Object({
			id: Type.String(),
			title: Type.String(),
			dependencies: Type.Optional(Type.Array(Type.String())),
			parallel_group: Type.Optional(Type.String()),
			can_run_parallel: Type.Optional(Type.Boolean()),
			conflicts_with: Type.Optional(Type.Array(Type.String())),
			files: Type.Object({ create: Type.Array(Type.String()), modify: Type.Array(Type.String()), test: Type.Array(Type.String()) }),
			steps: Type.Array(
				Type.Object({
					title: Type.String(),
					body: Type.String(),
					codeBlocks: Type.Optional(Type.Array(Type.Object({ language: Type.Optional(Type.String()), content: Type.String() }))),
					command: Type.Optional(Type.String()),
					expected: Type.Optional(Type.String()),
				}),
			),
			verification: Type.Array(Type.Object({ command: Type.String(), expected: Type.String() })),
			commit: Type.Optional(Type.Object({ message: Type.String(), paths: Type.Array(Type.String()) })),
		}),
	),
	overwrite: Type.Optional(Type.Boolean({ description: "Allow replacing existing plan files" })),
});

const PlanValidateParams = Type.Object({
	path: Type.String({ description: "Markdown plan path to validate" }),
});

function resolvePlanOutputPath(cwd: string, requested: string): string {
	const resolved = resolve(cwd, requested);
	const plansRoot = resolve(cwd, "docs", "plans");
	if (!resolved.startsWith(`${plansRoot}/`) && resolved !== plansRoot) {
		throw new Error("plan_create only writes under docs/plans");
	}
	if (!resolved.endsWith(".md")) throw new Error("plan_create path must end in .md");
	return resolved;
}

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
		name: "plan_create",
		label: "Plan Create",
		description: "Create a schema-valid executable plan markdown file plus .plan.json sidecar from structured input.",
		promptSnippet: "Create validated executable plan artifacts from structured task input",
		promptGuidelines: [
			"Use plan_create when writing implementation plans that should later be executed with execute_plan.",
			"Decompose work into the smallest safe independent tasks and provide parallel_group/conflicts_with metadata for worker dispatch.",
		],
		parameters: PlanCreateParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const outputPath = resolvePlanOutputPath(ctx.cwd, params.path);
			const sidecarPath = planSidecarPath(outputPath);
			if (!params.overwrite && (existsSync(outputPath) || existsSync(sidecarPath))) {
				throw new Error("Plan already exists. Pass overwrite=true to replace it.");
			}
			const plan: ExecutablePlanV1 = {
				schemaVersion: 1,
				title: params.title,
				goal: params.goal,
				architecture: params.architecture,
				techStack: params.tech_stack,
				tasks: params.tasks.map((task) => ({
					id: task.id,
					title: task.title,
					dependencies: task.dependencies ?? [],
					parallelGroup: task.parallel_group,
					canRunInParallel: task.can_run_parallel,
					conflictsWith: task.conflicts_with ?? [],
					files: task.files,
					steps: task.steps,
					verification: task.verification,
					...(task.commit ? { commit: task.commit } : {}),
				})),
			};
			const result = writeExecutablePlanFiles(plan, outputPath);
			return {
				content: [
					{
						type: "text",
						text: `Created executable plan: ${result.markdownPath}\nSidecar: ${result.sidecarPath}\nValidation: PASS\nTasks: ${plan.tasks.length}`,
					},
				],
				details: result,
			};
		},
	});

	pi.registerTool({
		name: "plan_validate",
		label: "Plan Validate",
		description: "Validate an executable plan markdown file and sidecar JSON without mutating plan execution state.",
		promptSnippet: "Validate executable plan artifacts before execution",
		promptGuidelines: ["Use plan_validate after plan_create or manual plan edits before execute_plan."],
		parameters: PlanValidateParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const markdownPath = resolve(ctx.cwd, params.path);
			const sidecarPath = planSidecarPath(markdownPath);
			if (!existsSync(sidecarPath)) throw new Error(`Missing sidecar: ${sidecarPath}`);
			const markdown = readFileSync(markdownPath, "utf8");
			const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
			const validation = validateExecutablePlan(sidecar);
			const hashMatches = sidecar.markdownHash === markdownHash(markdown);
			if (!validation.ok || !hashMatches) {
				const errors = [...validation.errors, ...(hashMatches ? [] : ["markdown hash does not match sidecar"] )];
				return {
					content: [{ type: "text", text: `Invalid executable plan v1\n${errors.map((error) => `- ${error}`).join("\n")}` }],
					isError: true,
					details: { errors },
				};
			}
			return {
				content: [{ type: "text", text: `Valid executable plan v1\nTasks: ${sidecar.tasks.length}\nSidecar: ${sidecarPath}` }],
				details: sidecar,
			};
		},
	});

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
