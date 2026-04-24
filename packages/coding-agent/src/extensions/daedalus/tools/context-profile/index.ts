import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { StringEnum } from "@daedalus-pi/ai";
import { type ExtensionAPI, type ExtensionContext, formatVisiblePath } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { buildSessionContext } from "../../../../core/session-manager.js";
import { analyzeContextProfile } from "./analyzer.js";
import { formatContextProfile } from "./format.js";

const Params = Type.Object({
	top: Type.Optional(Type.Number({ description: "Number of top entries to show (default: 10)" })),
	format: Type.Optional(StringEnum(["text", "json"] as const)),
});

function parseArgs(args: string): { top: number; format: "text" | "json"; insert: boolean } {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	let top = 10;
	let format: "text" | "json" = "text";
	let insert = false;
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (part === "--json") format = "json";
		if (part === "--insert") insert = true;
		if (part === "--top" && parts[i + 1]) {
			const parsed = Number(parts[i + 1]);
			if (Number.isFinite(parsed) && parsed > 0) top = Math.floor(parsed);
			i += 1;
		}
	}
	return { top, format, insert };
}

function buildProfile(pi: ExtensionAPI, ctx: ExtensionContext, top: number) {
	const context = buildSessionContext(ctx.sessionManager.getBranch());
	return analyzeContextProfile({
		systemPrompt: ctx.getSystemPrompt(),
		messages: context.messages,
		activeTools: pi.getActiveTools(),
		allTools: pi.getAllTools().map((tool) => ({ name: tool.name, description: tool.description })),
		top,
	});
}

function saveProfileReport(cwd: string, text: string, format: "text" | "json"): string {
	const dir = join(cwd, ".daedalus", "context-profiles");
	mkdirSync(dir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const extension = format === "json" ? "json" : "txt";
	const filePath = join(dir, `context-profile-${timestamp}.${extension}`);
	writeFileSync(filePath, `${text}\n`, "utf8");
	return filePath;
}

function summarizeProfile(profile: ReturnType<typeof analyzeContextProfile>): string {
	const topTool = profile.byTool[0];
	const topToolText = topTool
		? `top tool ${topTool.toolName} ${topTool.chars.toLocaleString()} chars`
		: "no tool results";
	return `${profile.total.chars.toLocaleString()} chars total; ${topToolText}`;
}

export default function contextProfileExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "context_profile",
		label: "Context Profile",
		description:
			"Deterministically analyze current session context usage by message, tool result, and tool type. Disabled by default; enable via /tools when debugging context bloat.",
		promptSnippet:
			"Analyze current session context usage and identify messages/tool outputs consuming the most context.",
		promptGuidelines: [
			"Use context_profile only when the user asks to debug context bloat or profile tool output size.",
		],
		defaultActive: false,
		parameters: Params,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const profile = buildProfile(pi, ctx, params.top ?? 10);
			const text = formatContextProfile(profile, { format: params.format ?? "text" });
			return { content: [{ type: "text", text }], details: profile };
		},
		renderResult(result, _options, theme) {
			const text = result.content.find((block) => block.type === "text" && "text" in block)?.text ?? "";
			return new Text(theme.fg("toolOutput", text), 0, 0);
		},
	});

	pi.registerCommand("context-profile", {
		description: "Profile deterministic context usage: /context-profile [--top N] [--json] [--insert]",
		handler: async (args, ctx) => {
			const options = parseArgs(args);
			const profile = buildProfile(pi, ctx, options.top);
			const text = formatContextProfile(profile, { format: options.format });
			if (options.insert) {
				ctx.ui.setEditorText(text);
				ctx.ui.notify("Context profile written to editor", "info");
				return;
			}
			const filePath = saveProfileReport(ctx.cwd, text, options.format);
			ctx.ui.notify(
				`Context profile saved to ${formatVisiblePath(filePath)} (${summarizeProfile(profile)})`,
				"info",
			);
		},
	});
}
