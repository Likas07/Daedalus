import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@daedalus-pi/coding-agent";
import { applySemanticToolExposure, rememberSemanticDesiredTools } from "../../tools/semantic-tool-availability.js";
import musePrimaryPrompt from "./prompts/muse-primary.md" with { type: "text" };
import sagePrimaryPrompt from "./prompts/sage-primary.md" with { type: "text" };

type PrimaryRoleMode = "daedalus" | "sage" | "muse";

const PRIMARY_ROLE_LABELS: Record<PrimaryRoleMode, string> = {
	daedalus: "Daedalus",
	sage: "Sage",
	muse: "Muse",
};

const SAGE_TOOLS = [
	"read",
	"grep",
	"find",
	"ls",
	"fs_search",
	"sem_search",
	"read_agent_result_output",
	"todo_read",
	"status_overview",
	"question",
	"questionnaire",
] as const;

const MUSE_TOOLS = [
	"read",
	"grep",
	"find",
	"ls",
	"fs_search",
	"sem_search",
	"read_agent_result_output",
	"todo_read",
	"todo_write",
	"execute_plan",
	"status_overview",
	"subagent",
	"question",
	"questionnaire",
	"write",
] as const;

function isPrimaryRoleMode(value: string): value is PrimaryRoleMode {
	return value === "daedalus" || value === "sage" || value === "muse";
}

function buildPrimaryRoleOverlay(role: Exclude<PrimaryRoleMode, "daedalus">): string {
	const rolePrompt = role === "sage" ? sagePrimaryPrompt.trim() : musePrimaryPrompt.trim();
	return [
		`[PRIMARY ROLE MODE: ${PRIMARY_ROLE_LABELS[role].toUpperCase()}]`,
		`For this session, you are operating as ${PRIMARY_ROLE_LABELS[role]} in primary user-facing mode.`,
		"Ignore any conflicting identity claims earlier in the system prompt about being Daedalus the primary assistant.",
		"You are not a delegated subagent in this mode, so delegated result-envelope rules do not apply.",
		rolePrompt,
	].join("\n\n");
}

export default function primaryRoleMode(pi: ExtensionAPI): void {
	let currentRole: PrimaryRoleMode = "daedalus";
	let baselineTools: string[] | undefined;

	function toolsForRole(role: PrimaryRoleMode): string[] | undefined {
		if (role === "daedalus") return baselineTools;
		return role === "sage" ? [...SAGE_TOOLS] : [...MUSE_TOOLS];
	}

	function persistRoleMode(): void {
		pi.appendEntry("primary-role-mode", { role: currentRole, baselineTools });
	}

	function applyRoleMode(ctx?: ExtensionContext | ExtensionCommandContext): void {
		const toolList = toolsForRole(currentRole);
		if (toolList) {
			rememberSemanticDesiredTools(toolList);
			pi.setActiveTools(ctx ? applySemanticToolExposure(toolList, ctx.cwd) : toolList);
		}
		if (ctx?.hasUI) {
			ctx.ui.setStatus(
				"primary-role-mode",
				currentRole === "daedalus" ? undefined : ctx.ui.theme.fg("accent", `role:${currentRole}`),
			);
		}
	}

	function restoreFromSession(ctx: ExtensionContext): void {
		baselineTools = pi.getActiveTools();
		const latest = ctx.sessionManager
			.getBranch()
			.filter((entry) => entry.type === "custom" && entry.customType === "primary-role-mode")
			.at(-1) as { data?: { role?: string; baselineTools?: string[] } } | undefined;
		const flagged = pi.getFlag("role");
		const fromFlag =
			typeof flagged === "string" && isPrimaryRoleMode(flagged) && flagged !== "daedalus" ? flagged : undefined;
		const fromSession = latest?.data?.role && isPrimaryRoleMode(latest.data.role) ? latest.data.role : undefined;
		currentRole = fromFlag ?? fromSession ?? "daedalus";
		baselineTools = latest?.data?.baselineTools ?? baselineTools;
		applyRoleMode(ctx);
	}

	pi.registerFlag("role", {
		description: "Start the session in a primary role mode: daedalus, sage, or muse",
		type: "string",
		default: "daedalus",
	});

	pi.registerCommand("role", {
		description: "Show or switch primary role mode: /role [daedalus|sage|muse]",
		handler: async (args, ctx) => {
			const requested = args.trim().toLowerCase();
			if (!requested) {
				ctx.ui.notify(`Current primary role: ${PRIMARY_ROLE_LABELS[currentRole]}`, "info");
				return;
			}
			if (!isPrimaryRoleMode(requested)) {
				ctx.ui.notify("Usage: /role [daedalus|sage|muse]", "error");
				return;
			}
			if (!baselineTools) {
				baselineTools = pi.getActiveTools();
			}
			currentRole = requested;
			applyRoleMode(ctx);
			persistRoleMode();
			pi.sendMessage(
				{
					customType: "primary-role-mode",
					content: `Primary role switched to ${PRIMARY_ROLE_LABELS[currentRole]}.`,
					display: true,
					details: { role: currentRole },
				},
				{ triggerTurn: false },
			);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		restoreFromSession(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreFromSession(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		if (currentRole === "daedalus") {
			return undefined;
		}
		return {
			systemPrompt: `${event.systemPrompt}\n\n${buildPrimaryRoleOverlay(currentRole)}`,
		};
	});
}
