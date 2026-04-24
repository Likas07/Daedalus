import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Type } from "@sinclair/typebox";
import Ajv from "ajv";

export const ExecutablePlanStepSchema = Type.Object({
	title: Type.String(),
	body: Type.String(),
	codeBlocks: Type.Optional(Type.Array(Type.Object({ language: Type.Optional(Type.String()), content: Type.String() }))),
	command: Type.Optional(Type.String()),
	expected: Type.Optional(Type.String()),
});

export const ExecutablePlanTaskSchema = Type.Object({
	id: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
	title: Type.String(),
	dependencies: Type.Optional(Type.Array(Type.String())),
	parallelGroup: Type.Optional(Type.String()),
	canRunInParallel: Type.Optional(Type.Boolean()),
	conflictsWith: Type.Optional(Type.Array(Type.String())),
	files: Type.Object({
		create: Type.Array(Type.String()),
		modify: Type.Array(Type.String()),
		test: Type.Array(Type.String()),
	}),
	steps: Type.Array(ExecutablePlanStepSchema, { minItems: 1 }),
	verification: Type.Array(Type.Object({ command: Type.String(), expected: Type.String() }), { minItems: 1 }),
	commit: Type.Optional(Type.Object({ message: Type.String(), paths: Type.Array(Type.String()) })),
});

export const ExecutablePlanV1Schema = Type.Object({
	schemaVersion: Type.Literal(1),
	title: Type.String(),
	goal: Type.String(),
	architecture: Type.String(),
	techStack: Type.Array(Type.String()),
	tasks: Type.Array(ExecutablePlanTaskSchema, { minItems: 1 }),
});

export interface ExecutablePlanV1 {
	schemaVersion: 1;
	title: string;
	goal: string;
	architecture: string;
	techStack: string[];
	tasks: Array<{
		id: string;
		title: string;
		dependencies?: string[];
		parallelGroup?: string;
		canRunInParallel?: boolean;
		conflictsWith?: string[];
		files: { create: string[]; modify: string[]; test: string[] };
		steps: Array<{
			title: string;
			body: string;
			codeBlocks?: Array<{ language?: string; content: string }>;
			command?: string;
			expected?: string;
		}>;
		verification: Array<{ command: string; expected: string }>;
		commit?: { message: string; paths: string[] };
	}>;
}

export interface PlanValidationResult {
	ok: boolean;
	errors: string[];
}

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(ExecutablePlanV1Schema);

function taskFiles(task: ExecutablePlanV1["tasks"][number]): string[] {
	return [...task.files.create, ...task.files.modify, ...task.files.test].sort();
}

function validateParallelSafety(plan: ExecutablePlanV1): string[] {
	const errors: string[] = [];
	const byGroup = new Map<string, ExecutablePlanV1["tasks"]>();
	for (const task of plan.tasks.filter((item) => item.canRunInParallel !== false)) {
		const group = task.parallelGroup ?? "default";
		const list = byGroup.get(group) ?? [];
		list.push(task);
		byGroup.set(group, list);
	}
	for (const [group, tasks] of byGroup.entries()) {
		for (let i = 0; i < tasks.length; i++) {
			for (let j = i + 1; j < tasks.length; j++) {
				const left = tasks[i];
				const right = tasks[j];
				const declaredConflict =
					(left.conflictsWith ?? []).includes(right.id) || (right.conflictsWith ?? []).includes(left.id);
				const dependency = (left.dependencies ?? []).includes(right.id) || (right.dependencies ?? []).includes(left.id);
				if (declaredConflict || dependency) continue;
				const rightFiles = new Set(taskFiles(right));
				for (const file of taskFiles(left)) {
					if (rightFiles.has(file)) errors.push(`parallel group ${group} has overlapping file ${file} in ${left.id} and ${right.id}`);
				}
			}
		}
	}
	return errors;
}

export function validateExecutablePlan(value: unknown): PlanValidationResult {
	const ok = validate(value);
	if (!ok) return { ok, errors: (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`) };
	const parallelErrors = validateParallelSafety(value as ExecutablePlanV1);
	return { ok: parallelErrors.length === 0, errors: parallelErrors };
}

export function markdownHash(markdown: string): string {
	return createHash("sha256").update(markdown).digest("hex");
}

export function planSidecarPath(markdownPath: string): string {
	return markdownPath.replace(/[.]md$/i, ".plan.json");
}

function codeFence(language: string | undefined, content: string): string {
	return `\`\`\`${language ?? ""}\n${content.replace(/\n$/, "")}\n\`\`\``;
}

export function renderExecutablePlanMarkdown(plan: ExecutablePlanV1): string {
	const lines: string[] = [
		`# ${plan.title} Implementation Plan`,
		"",
		"> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan. Execute adaptively: do simple work inline, and use subagents or parallelization when helpful. Steps use checkbox (`- [ ]`) syntax for tracking.",
		"",
		"<!-- daedalus-plan: v1 -->",
		"",
		`**Goal:** ${plan.goal}`,
		"",
		`**Architecture:** ${plan.architecture}`,
		"",
		`**Tech Stack:** ${plan.techStack.join(", ")}`,
		"",
		"---",
		"",
	];
	for (const [index, task] of plan.tasks.entries()) {
		lines.push(`### Task ${index + 1}: ${task.title}`);
		lines.push(`<!-- daedalus-task-id: ${task.id} -->`);
		lines.push(`<!-- daedalus-depends-on: ${(task.dependencies ?? []).join(", ") || "none"} -->`);
		lines.push(`<!-- daedalus-parallel-group: ${task.parallelGroup ?? "default"} -->`);
		lines.push(`<!-- daedalus-can-run-parallel: ${task.canRunInParallel !== false ? "true" : "false"} -->`);
		lines.push(`<!-- daedalus-conflicts-with: ${(task.conflictsWith ?? []).join(", ") || "none"} -->`);
		lines.push("", "**Files:**");
		for (const file of task.files.create) lines.push(`- Create: \`${file}\``);
		for (const file of task.files.modify) lines.push(`- Modify: \`${file}\``);
		for (const file of task.files.test) lines.push(`- Test: \`${file}\``);
		lines.push("", "**Steps:**");
		for (const [stepIndex, step] of task.steps.entries()) {
			lines.push(`- [ ] **Step ${stepIndex + 1}: ${step.title}**`, "", step.body, "");
			for (const block of step.codeBlocks ?? []) lines.push(codeFence(block.language, block.content), "");
			if (step.command) lines.push(`Run: \`${step.command}\``);
			if (step.expected) lines.push(`Expected: ${step.expected}`);
		}
		lines.push("", "**Verification:**");
		for (const item of task.verification) lines.push(codeFence("bash", item.command), `Expected: ${item.expected}`, "");
		if (task.commit) {
			lines.push(
				"**Commit:**",
				codeFence("bash", [`git add ${task.commit.paths.join(" ")}`, `git commit -m ${JSON.stringify(task.commit.message)}`].join("\n")),
				"",
			);
		}
	}
	return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export function writeExecutablePlanFiles(
	plan: ExecutablePlanV1,
	markdownPath: string,
): { markdownPath: string; sidecarPath: string; markdownHash: string } {
	const validation = validateExecutablePlan(plan);
	if (!validation.ok) throw new Error(`Invalid executable plan:\n${validation.errors.join("\n")}`);
	const markdown = renderExecutablePlanMarkdown(plan);
	const hash = markdownHash(markdown);
	const sidecarPath = planSidecarPath(markdownPath);
	mkdirSync(dirname(markdownPath), { recursive: true });
	writeFileSync(markdownPath, markdown, "utf8");
	writeFileSync(sidecarPath, `${JSON.stringify({ ...plan, markdownPath, markdownHash: hash }, null, 2)}\n`, "utf8");
	return { markdownPath, sidecarPath, markdownHash: hash };
}
