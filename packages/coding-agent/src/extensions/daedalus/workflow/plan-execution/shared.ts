import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TodoItem } from "../../tools/todo-state.js";
import { markdownHash, planSidecarPath, validateExecutablePlan } from "./schema.js";
import {
	createTodoSnapshot,
	replaceTodoList,
	type TodoSnapshot,
	type TodoWriteResult,
} from "../../tools/todo-state.js";
import { markdownHash, planSidecarPath, validateExecutablePlan } from "./schema.js";

export interface PlanArtifactStep {
	step: number;
	content: string;
	id: string;
	verification?: string;
	lane?: string;
	detail?: string;
	files?: string[];
	dependsOn?: string[];
	parallelGroup?: string;
	canRunInParallel?: boolean;
	conflictsWith?: string[];
}

export interface PlanArtifact {
	format: "markdown-numbered-steps-v1" | "markdown-task-sections-v1" | "executable-plan-v1";
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

function extractFiles(detail: string): string[] {
	const files = new Set<string>();
	for (const match of detail.matchAll(/`([^`]+)`/g)) {
		const value = match[1]?.trim();
		if (!value) continue;
		if (value.includes("/") || value.startsWith("packages/") || value.startsWith("docs/")) files.add(value);
	}
	return [...files].sort();
}

function maskFencedCode(text: string): string {
	return text.replace(/^```[\s\S]*?^```/gm, (block) => block.replace(/[^\n]/g, " "));
}

function parseTaskSectionArtifact(text: string, sourcePath?: string): PlanArtifact | undefined {
	const headingRegex = /^###\s+Task\s+(\d+)\s*:\s*(.+)$/gm;
	const maskedText = maskFencedCode(text);
	const headings = [...maskedText.matchAll(headingRegex)];
	if (headings.length === 0) return undefined;
	const steps: PlanArtifactStep[] = headings.map((heading, index) => {
		const step = Number(heading[1]);
		const title = `Task ${step}: ${(heading[2] ?? "").trim()}`;
		const detailStart = (heading.index ?? 0) + heading[0].length;
		const nextHeading = headings[index + 1];
		const detailEnd = nextHeading?.index ?? text.length;
		const detail = text.slice(detailStart, detailEnd).trim();
		return {
			step,
			content: title,
			id: `plan-task-${step}-${slugify(title) || step}`,
			detail,
			files: extractFiles(detail),
			dependsOn: [],
			parallelGroup: "default",
			canRunInParallel: true,
			conflictsWith: [],
		};
	});
	return { format: "markdown-task-sections-v1", path: sourcePath, steps };
}

export function parsePlanArtifactText(text: string, sourcePath?: string): PlanArtifact {
	const taskSectionPlan = parseTaskSectionArtifact(text, sourcePath);
	if (taskSectionPlan) return taskSectionPlan;
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

function renderExecutableTaskDetail(task: any, step: number): string {
	const lines: string[] = [`# Task ${step}: ${task.title}`, "", "Files:"];
	for (const file of task.files.create ?? []) lines.push(`- Create: ${file}`);
	for (const file of task.files.modify ?? []) lines.push(`- Modify: ${file}`);
	for (const file of task.files.test ?? []) lines.push(`- Test: ${file}`);
	lines.push("", "Steps:");
	for (const [index, item] of (task.steps ?? []).entries()) {
		lines.push(`${index + 1}. ${item.title}`, item.body, "");
		if (item.command) lines.push(`Run: ${item.command}`);
		if (item.expected) lines.push(`Expected: ${item.expected}`);
	}
	lines.push("Verification:");
	for (const item of task.verification ?? []) lines.push(`- ${item.command} (${item.expected})`);
	return lines.join("\n").trim();
}

export function loadPlanArtifact(filePath: string, cwd: string): PlanArtifact {
	const resolved = resolve(cwd, filePath);
	const text = readFileSync(resolved, "utf-8");
	const sidecarPath = planSidecarPath(resolved);
	if (existsSync(sidecarPath)) {
		const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8"));
		const validation = validateExecutablePlan(sidecar);
		if (!validation.ok) throw new Error(`Invalid executable plan sidecar:\n${validation.errors.join("\n")}`);
		if (sidecar.markdownHash && sidecar.markdownHash !== markdownHash(text)) {
			throw new Error("Executable plan markdown changed since sidecar generation. Run plan_validate or plan_create overwrite=true.");
		}
		return {
			format: "executable-plan-v1",
			path: resolved,
			steps: sidecar.tasks.map((task: any, index: number) => ({
				step: index + 1,
				content: `Task ${index + 1}: ${task.title}`,
				id: task.id,
				detail: renderExecutableTaskDetail(task, index + 1),
				files: [...task.files.create, ...task.files.modify, ...task.files.test].sort(),
				verification: task.verification.map((item: any) => item.command).join(" && "),
				lane: task.parallelGroup,
				dependsOn: task.dependencies ?? [],
				parallelGroup: task.parallelGroup ?? "default",
				canRunInParallel: task.canRunInParallel !== false,
				conflictsWith: task.conflictsWith ?? [],
			})),
		};
	}
	return parsePlanArtifactText(text, resolved);
}

export function planArtifactToTodos(plan: PlanArtifact): TodoItem[] {
	return plan.steps.map((step, index) => ({
		id: step.id,
		content: step.content,
		status: index === 0 ? "in_progress" : "pending",
	}));
}

export function initializePlanExecution(
	plan: PlanArtifact,
	existing?: TodoSnapshot,
): TodoWriteResult & { plan: PlanArtifact } {
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

export function findPlanStepBySelector(state: PlanExecutionState, selector: "active" | "next" | string): PlanArtifactStep | undefined {
	if (selector === "active") {
		const active = state.todos.find((todo) => todo.status === "in_progress");
		return active ? state.plan.steps.find((step) => step.id === active.id) : undefined;
	}
	if (selector === "next") {
		const next = state.todos.find((todo) => todo.status === "pending") ?? state.todos.find((todo) => todo.status === "in_progress");
		return next ? state.plan.steps.find((step) => step.id === next.id) : undefined;
	}
	return state.plan.steps.find((step) => step.id === selector || String(step.step) === selector);
}

export function formatPlanStepDetail(step: PlanArtifactStep): string {
	const lines: string[] = [`# ${step.content}`, ""];
	if (step.files?.length) {
		lines.push("Files:");
		lines.push(...step.files.map((file) => `- ${file}`));
		lines.push("");
	}
	if (step.parallelGroup) lines.push(`Parallel group: ${step.parallelGroup}`, "");
	if (step.dependsOn?.length) lines.push(`Depends on: ${step.dependsOn.join(", ")}`, "");
	if (step.conflictsWith?.length) lines.push(`Conflicts with: ${step.conflictsWith.join(", ")}`, "");
	if (step.verification) {
		lines.push(`Verification: ${step.verification}`, "");
	}
	lines.push(step.detail?.trim() || step.content);
	return lines.join("\n").trim();
}

export function readyParallelGroups(state: PlanExecutionState): Array<{ group: string; steps: PlanArtifactStep[] }> {
	const completed = new Set(state.todos.filter((todo) => todo.status === "completed").map((todo) => todo.id));
	const activeOrPending = new Set(
		state.todos.filter((todo) => todo.status === "pending" || todo.status === "in_progress").map((todo) => todo.id),
	);
	const groups = new Map<string, PlanArtifactStep[]>();
	for (const step of state.plan.steps) {
		if (!activeOrPending.has(step.id)) continue;
		if ((step.dependsOn ?? []).some((id) => !completed.has(id))) continue;
		const group = step.parallelGroup ?? step.lane ?? "default";
		const list = groups.get(group) ?? [];
		list.push(step);
		groups.set(group, list);
	}
	return [...groups.entries()].map(([group, steps]) => ({ group, steps }));
}
