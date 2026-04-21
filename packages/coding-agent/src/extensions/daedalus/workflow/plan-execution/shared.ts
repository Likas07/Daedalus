import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TodoItem } from "../../tools/todo-state.js";
import { createTodoSnapshot, replaceTodoList, type TodoSnapshot, type TodoWriteResult } from "../../tools/todo-state.js";

export interface PlanArtifactStep {
	step: number;
	content: string;
	id: string;
	verification?: string;
	lane?: string;
}

export interface PlanArtifact {
	format: "markdown-numbered-steps-v1";
	path?: string;
	steps: PlanArtifactStep[];
}

export interface PlanExecutionState extends TodoSnapshot {
	plan: PlanArtifact;
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

function parsePlanBody(text: string): string {
	const match = text.match(/\*{0,2}Plan:\*{0,2}\s*\n([\s\S]*)/i);
	if (!match?.[1]) {
		throw new Error("Plan artifact does not contain a parseable numbered Plan: section.");
	}
	return match[1];
}

export function parsePlanArtifactText(text: string, sourcePath?: string): PlanArtifact {
	const body = parsePlanBody(text);
	const stepRegex = /^\s*(\d+)[.)]\s+(.*)$/gm;
	const steps: PlanArtifactStep[] = [];
	for (const match of body.matchAll(stepRegex)) {
		const step = Number(match[1]);
		const raw = (match[2] ?? "").trim();
		if (!raw) continue;
		const laneMatch = raw.match(/^\[lane:([^\]]+)\]\s*(.*)$/i);
		const lane = laneMatch?.[1]?.trim();
		const withoutLane = (laneMatch?.[2] ?? raw).trim();
		const verifySplit = withoutLane.split(/\|\s*verify:\s*/i);
		const content = verifySplit[0]?.trim();
		const verification = verifySplit[1]?.trim();
		if (!content) continue;
		steps.push({
			step,
			content,
			id: `plan-step-${step}-${slugify(content) || step}`,
			...(verification ? { verification } : {}),
			...(lane ? { lane } : {}),
		});
	}
	if (steps.length === 0) {
		throw new Error("Plan artifact does not contain a parseable numbered Plan: section.");
	}
	return {
		format: "markdown-numbered-steps-v1",
		path: sourcePath,
		steps,
	};
}

export function loadPlanArtifact(filePath: string, cwd: string): PlanArtifact {
	const resolved = resolve(cwd, filePath);
	const text = readFileSync(resolved, "utf-8");
	return parsePlanArtifactText(text, resolved);
}

export function planArtifactToTodos(plan: PlanArtifact): TodoItem[] {
	return plan.steps.map((step, index) => ({
		id: step.id,
		content: step.content,
		status: index === 0 ? "in_progress" : "pending",
	}));
}

export function initializePlanExecution(plan: PlanArtifact, existing?: TodoSnapshot): TodoWriteResult & { plan: PlanArtifact } {
	const base = planArtifactToTodos(plan);
	const existingById = new Map(existing?.todos.map((todo) => [todo.id, todo.status]) ?? []);
	const resumed = base.map((todo) => {
		const previousStatus = existingById.get(todo.id);
		return previousStatus ? { ...todo, status: previousStatus } : todo;
	});
	if (!resumed.some((todo) => todo.status === "in_progress")) {
		const firstPendingIndex = resumed.findIndex((todo) => todo.status === "pending");
		if (firstPendingIndex >= 0) {
			resumed[firstPendingIndex] = { ...resumed[firstPendingIndex], status: "in_progress" };
		}
	}
	const result = replaceTodoList(existing?.todos ?? [], resumed);
	return { ...result, plan };
}

export function resumePlanExecution(plan: PlanArtifact, existing?: TodoSnapshot): PlanExecutionState {
	const result = initializePlanExecution(plan, existing);
	return { plan: result.plan, todos: result.todos, summary: result.summary };
}

export function hasUnfinishedPlanWork(state: PlanExecutionState): boolean {
	return state.todos.some((todo) => todo.status === "pending" || todo.status === "in_progress");
}

export function markPlanStepsCompleted(state: PlanExecutionState, completedSteps: number[]): PlanExecutionState {
	const nextTodos = state.todos.map((todo, index) => {
		const stepNumber = index + 1;
		if (completedSteps.includes(stepNumber)) {
			return { ...todo, status: "completed" as const };
		}
		return todo;
	});
	if (!nextTodos.some((todo) => todo.status === "in_progress")) {
		const nextPendingIndex = nextTodos.findIndex((todo) => todo.status === "pending");
		if (nextPendingIndex >= 0) {
			nextTodos[nextPendingIndex] = { ...nextTodos[nextPendingIndex], status: "in_progress" };
		}
	}
	const snapshot = createTodoSnapshot(nextTodos);
	return { ...snapshot, plan: state.plan };
}
