import * as fs from "node:fs";
import type { ExtensionCommandContext } from "@daedalus-pi/coding-agent";
import { type Component, Key, matchesKey, Text, truncateToWidth } from "@daedalus-pi/tui";
import type { SubagentRunStatus } from "../../../../core/subagents/index.js";
import { buildRunInspectorModel, type InspectorAction, type RunInspectorModel } from "./inspector.js";

async function showArtifactContent(ctx: ExtensionCommandContext, title: string, content: string): Promise<void> {
	await ctx.ui.custom(
		(_tui, _theme, _kb, done) => {
			const text = new Text(`${title}\n\n${content}`, 0, 0);
			return {
				render: (width: number) => text.render(width),
				invalidate: () => text.invalidate(),
				handleInput: (input: string) => {
					if (input === "escape" || input === "q") done(undefined);
				},
			};
		},
		{ overlay: true },
	);
}

export async function showTextArtifact(ctx: ExtensionCommandContext, title: string, filePath: string): Promise<void> {
	const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : `Missing artifact: ${filePath}`;
	await showArtifactContent(ctx, title, content);
}

export async function showJsonArtifact(ctx: ExtensionCommandContext, title: string, filePath: string): Promise<void> {
	if (!fs.existsSync(filePath)) {
		await showArtifactContent(ctx, title, `Missing artifact: ${filePath}`);
		return;
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
		await showArtifactContent(ctx, title, JSON.stringify(parsed, null, 2));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await showArtifactContent(ctx, title, `Invalid JSON artifact: ${filePath}\n\n${message}`);
	}
}

export async function showSubagentTranscript(ctx: ExtensionCommandContext, sessionFile: string): Promise<void> {
	await showTextArtifact(ctx, "Subagent transcript", sessionFile);
}

async function runInspectorAction(
	ctx: ExtensionCommandContext,
	model: RunInspectorModel,
	action: InspectorAction,
): Promise<void> {
	switch (action.kind) {
		case "transcript":
			if (action.path) await showTextArtifact(ctx, `${model.agentLabel} transcript`, action.path);
			return;
		case "context":
			if (action.path) await showTextArtifact(ctx, `${model.agentLabel} context`, action.path);
			return;
		case "result":
			if (action.path) await showJsonArtifact(ctx, `${model.agentLabel} result`, action.path);
			return;
		case "meta":
			if (action.path) await showJsonArtifact(ctx, `${model.agentLabel} metadata`, action.path);
			return;
		case "open-child":
			if (action.path) await ctx.switchSession(action.path);
			return;
		case "back-to-parent":
			if (action.path) await ctx.switchSession(action.path);
			return;
	}
}

function formatTimestamp(label: string, value?: number): string | undefined {
	if (!value) return undefined;
	return `${label}: ${new Date(value).toLocaleString()}`;
}

function createInspectorComponent(
	ctx: ExtensionCommandContext,
	model: RunInspectorModel,
	done: (value: undefined) => void,
): Component {
	let selected = 0;
	let cachedLines: string[] | undefined;

	const refresh = () => {
		cachedLines = undefined;
	};

	const choose = async (index: number) => {
		const action = model.actions[index];
		if (!action) return;
		await runInspectorAction(ctx, model, action);
		if (action.kind === "open-child" || action.kind === "back-to-parent") {
			done(undefined);
			return;
		}
		refresh();
	};

	return {
		invalidate: refresh,
		handleInput: (input: string) => {
			if (matchesKey(input, Key.up)) {
				selected = Math.max(0, selected - 1);
				refresh();
				return;
			}
			if (matchesKey(input, Key.down)) {
				selected = Math.min(Math.max(0, model.actions.length - 1), selected + 1);
				refresh();
				return;
			}
			if (matchesKey(input, Key.enter)) {
				void choose(selected);
				return;
			}
			if (input >= "1" && input <= "9") {
				const index = Number(input) - 1;
				if (index >= 0 && index < model.actions.length) {
					selected = index;
					void choose(index);
				}
				return;
			}
			if (matchesKey(input, Key.escape) || input === "q") {
				done(undefined);
			}
		},
		render: (width: number) => {
			if (cachedLines) return cachedLines;
			const lines: string[] = [];
			const push = (text = "") => lines.push(truncateToWidth(text, width));
			push(model.title);
			push("");
			if (model.goal) push(`Goal: ${model.goal}`);
			push(`Summary: ${model.summary}`);
			if (model.activity) push(`Activity: ${model.activity}`);
			for (const line of [
				formatTimestamp("Started", model.startedAt),
				formatTimestamp("Updated", model.updatedAt),
			]) {
				if (line) push(line);
			}
			if (model.recentActivity?.length) {
				push("");
				push("Recent activity:");
				for (const activity of model.recentActivity.slice(-4)) push(`  - ${activity}`);
			}
			push("");
			push("Actions:");
			if (model.actions.length === 0) {
				push("  No actions available for this run.");
			} else {
				model.actions.forEach((action, index) => {
					const prefix = index === selected ? ">" : " ";
					push(`${prefix} ${index + 1}. ${action.label}`);
				});
			}
			push("");
			push("Use ↑/↓ to choose, Enter to open, or press a number key. Esc closes.");
			cachedLines = lines;
			return lines;
		},
	};
}

export async function showSubagentInspector(ctx: ExtensionCommandContext, model: RunInspectorModel): Promise<void> {
	await ctx.ui.custom<void>((_tui, _theme, _kb, done) => createInspectorComponent(ctx, model, done), {
		overlay: true,
	});
}

export async function openSubagentInspectorFromDetails(
	ctx: ExtensionCommandContext,
	details: {
		runId?: string;
		agent: string;
		goal?: string;
		status: SubagentRunStatus;
		summary: string;
		activity?: string;
		recentActivity?: string[];
		childSessionFile?: string;
		contextArtifactPath?: string;
		resultArtifactPath?: string;
	},
): Promise<void> {
	await showSubagentInspector(
		ctx,
		buildRunInspectorModel({
			runId: details.runId ?? "subagent-run",
			agent: details.agent,
			status: details.status,
			summary: details.summary,
			goal: details.goal,
			activity: details.activity,
			recentActivity: details.recentActivity,
			childSessionFile: details.childSessionFile,
			contextArtifactPath: details.contextArtifactPath,
			resultArtifactPath: details.resultArtifactPath,
			parentSessionFile: ctx.sessionManager.getSessionFile(),
		}),
	);
}

export { runInspectorAction };
