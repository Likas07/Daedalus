import type { AgentMessage } from "@daedalus-pi/agent-core";
import type { AssistantMessage, TextContent } from "@daedalus-pi/ai";
import type { ExtensionAPI, ExtensionContext } from "@daedalus-pi/coding-agent";
import { Key } from "@daedalus-pi/tui";
import { createTodoSnapshot, type TodoItem as StructuredTodoItem } from "../../tools/todo-state.js";
import {
	hasUnfinishedPlanWork,
	markPlanStepsCompleted,
	parsePlanArtifactText,
	planArtifactToTodos,
	type PlanArtifact,
} from "../plan-execution/shared.js";
import { extractDoneSteps, extractTodoItems, isSafeCommand } from "./utils.js";

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];
const NORMAL_MODE_TOOLS = ["read", "bash", "hashline_edit", "write", "todo_read", "todo_write", "execute_plan"];

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function buildFallbackPlanFromTodos(todos: StructuredTodoItem[]): PlanArtifact {
	return {
		format: "markdown-numbered-steps-v1",
		steps: todos.map((todo, index) => ({ step: index + 1, content: todo.content, id: todo.id })),
	};
}

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let executionMode = false;
	let currentPlan: PlanArtifact | undefined;
	let planTodos: StructuredTodoItem[] = [];

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: planModeEnabled,
			executing: executionMode,
			plan: currentPlan,
			planTodos,
		});
		if (planTodos.length > 0) {
			pi.appendEntry("plan-execution-state", {
				plan: currentPlan,
				todos: planTodos,
				summary: createTodoSnapshot(planTodos).summary,
			});
		}
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (executionMode && planTodos.length > 0) {
			const completed = planTodos.filter((todo) => todo.status === "completed").length;
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", `📋 ${completed}/${planTodos.length}`));
		} else if (planModeEnabled) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ plan"));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}

		if (executionMode && planTodos.length > 0) {
			const lines = planTodos.map((todo) => {
				if (todo.status === "completed") {
					return ctx.ui.theme.fg("success", "☑ ") + ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(todo.content));
				}
				if (todo.status === "in_progress") {
					return `${ctx.ui.theme.fg("accent", "▶ ")}${todo.content}`;
				}
				return `${ctx.ui.theme.fg("muted", "☐ ")}${todo.content}`;
			});
			ctx.ui.setWidget("plan-todos", lines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		planModeEnabled = !planModeEnabled;
		executionMode = false;
		currentPlan = undefined;
		planTodos = [];
		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
			ctx.ui.notify(`Plan mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
		} else {
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			ctx.ui.notify("Plan mode disabled. Full access restored.");
		}
		persistState();
		updateStatus(ctx);
	}

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerCommand("todos", {
		description: "Show current plan todo list",
		handler: async (_args, ctx) => {
			if (planTodos.length === 0) {
				ctx.ui.notify("No todos. Create a plan first with /plan", "info");
				return;
			}
			const list = planTodos
				.map((todo, i) => `${i + 1}. ${todo.status === "completed" ? "✓" : todo.status === "in_progress" ? "▶" : "○"} ${todo.content}`)
				.join("\n");
			ctx.ui.notify(`Plan Progress:\n${list}`, "info");
		},
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	pi.on("tool_call", async (event) => {
		if (!planModeEnabled || event.toolName !== "bash") return;
		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `Plan mode: command blocked (not allowlisted). Use /plan to disable plan mode first.\nCommand: ${command}`,
			};
		}
	});

	pi.on("context", async (event) => {
		if (planModeEnabled) return;
		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType === "plan-mode-context") return false;
				if (msg.role !== "user") return true;
				const content = msg.content;
				if (typeof content === "string") return !content.includes("[PLAN MODE ACTIVE]");
				if (Array.isArray(content)) {
					return !content.some((c) => c.type === "text" && (c as TextContent).text?.includes("[PLAN MODE ACTIVE]"));
				}
				return true;
			}),
		};
	});

	pi.on("before_agent_start", async () => {
		if (planModeEnabled) {
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- You can only use: read, bash, grep, find, ls, questionnaire
- You CANNOT use: hashline_edit, edit, write (file modifications are disabled)
- Bash is restricted to an allowlist of read-only commands

Ask clarifying questions using the questionnaire tool.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes - just describe what you would do.`,
					display: false,
				},
			};
		}

		if (executionMode && planTodos.length > 0) {
			const remaining = planTodos.filter((todo) => todo.status !== "completed" && todo.status !== "cancelled");
			const todoList = remaining.map((todo, index) => `${index + 1}. ${todo.content}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.
After completing a step, include a [DONE:n] tag in your response.`,
					display: false,
				},
			};
		}
	});

	pi.on("turn_end", async (event, ctx) => {
		if (!executionMode || planTodos.length === 0) return;
		if (!isAssistantMessage(event.message)) return;
		const completedSteps = extractDoneSteps(getTextContent(event.message));
		if (completedSteps.length > 0) {
			const plan = currentPlan ?? buildFallbackPlanFromTodos(planTodos);
			planTodos = markPlanStepsCompleted({ ...createTodoSnapshot(planTodos), plan }, completedSteps).todos;
			updateStatus(ctx);
		}
		persistState();
	});

	pi.on("agent_end", async (event, ctx) => {
		if (executionMode && planTodos.length > 0) {
			if (!hasUnfinishedPlanWork({ ...createTodoSnapshot(planTodos), plan: currentPlan ?? buildFallbackPlanFromTodos(planTodos) })) {
				const completedList = planTodos.map((todo) => `~~${todo.content}~~`).join("\n");
				pi.sendMessage({ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true }, { triggerTurn: false });
				executionMode = false;
				currentPlan = undefined;
				planTodos = [];
				pi.setActiveTools(NORMAL_MODE_TOOLS);
				persistState();
				updateStatus(ctx);
			}
			return;
		}

		if (!planModeEnabled || !ctx.hasUI) return;
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const text = getTextContent(lastAssistant);
			if (extractTodoItems(text).length > 0) {
				currentPlan = parsePlanArtifactText(text);
				planTodos = planArtifactToTodos(currentPlan);
			}
		}

		if (planTodos.length > 0) {
			const todoListText = planTodos.map((todo, i) => `${i + 1}. ☐ ${todo.content}`).join("\n");
			pi.sendMessage({ customType: "plan-todo-list", content: `**Plan Steps (${planTodos.length}):**\n\n${todoListText}`, display: true }, { triggerTurn: false });
		}

		const choice = await ctx.ui.select("Plan mode - what next?", [
			planTodos.length > 0 ? "Execute the plan (track progress)" : "Execute the plan",
			"Stay in plan mode",
			"Refine the plan",
		]);

		if (choice?.startsWith("Execute")) {
			planModeEnabled = false;
			executionMode = planTodos.length > 0;
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			persistState();
			updateStatus(ctx);
			const execMessage = planTodos.length > 0 ? `Execute the plan. Start with: ${planTodos[0]?.content ?? "step 1"}` : "Execute the plan you just created.";
			pi.sendMessage({ customType: "plan-mode-execute", content: execMessage, display: true }, { triggerTurn: true });
		} else if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) pi.sendUserMessage(refinement.trim());
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) planModeEnabled = true;
		const entries = ctx.sessionManager.getEntries();
		const planModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as { data?: { enabled?: boolean; executing?: boolean; plan?: PlanArtifact; planTodos?: StructuredTodoItem[] } } | undefined;
		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
			executionMode = planModeEntry.data.executing ?? executionMode;
			currentPlan = planModeEntry.data.plan ?? currentPlan;
			planTodos = planModeEntry.data.planTodos ?? planTodos;
		}
		if (planModeEnabled) pi.setActiveTools(PLAN_MODE_TOOLS);
		updateStatus(ctx);
	});
}
