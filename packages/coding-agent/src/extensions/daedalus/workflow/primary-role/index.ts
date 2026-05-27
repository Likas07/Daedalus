import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@daedalus-pi/coding-agent";
import { minimatch } from "minimatch";
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
	"read_agent_result_output",
	"todo_read",
	"status_overview",
	"questionnaire",
] as const;

const MUSE_TOOLS = [
	"read",
	"grep",
	"find",
	"ls",
	"fs_search",
	"read_agent_result_output",
	"todo_read",
	"todo_write",
	"plan_create",
	"plan_validate",
	"status_overview",
	"subagent",
	"questionnaire",
	"write",
	"hashline_edit",
	"skill",
] as const;

const IMPLEMENTATION_HANDOFF_TOOLS = [
	"plan_validate",
	"execute_plan",
	"plan_task_read",
	"subagent",
	"todo_read",
	"todo_write",
] as const;
const MUSE_PLAN_HANDOFF_OPTIONS = ["Implement with Daedalus", "Revise plan", "Stay in Muse"] as const;

type MusePlanReadyMetadata = {
	path: string;
	sidecarPath?: string;
	validated: true;
	createdAt: string;
};

function extractSidecarPath(details: unknown): string | undefined {
	if (!details || typeof details !== "object") return undefined;
	const { sidecarPath, sidecar } = details as { sidecarPath?: unknown; sidecar?: unknown };
	return typeof sidecarPath === "string" ? sidecarPath : typeof sidecar === "string" ? sidecar : undefined;
}
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

const MUSE_WRITABLE_GLOBS = ["**/*.md"] as const;
const MUSE_WRITE_TOOLS = new Set(["write", "edit", "hashline_edit"]);

function normalizeToolPath(cwd: string, rawPath: string): string {
	const normalized = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath;
	return path.resolve(cwd, normalized);
}

function isMuseWritablePath(cwd: string, rawPath: string): boolean {
	const absolutePath = normalizeToolPath(cwd, rawPath);
	const relativePath = path.relative(cwd, absolutePath) || path.basename(absolutePath);
	return MUSE_WRITABLE_GLOBS.some(
		(glob) => minimatch(absolutePath, glob, { dot: true }) || minimatch(relativePath, glob, { dot: true }),
	);
}

function extractMutationPaths(toolName: string, input: Record<string, unknown>): string[] {
	if (toolName === "hashline_edit") {
		const edits = Array.isArray(input.edits) ? input.edits : [];
		return edits.flatMap((edit) => {
			if (!edit || typeof edit !== "object") return [];
			const paths = [];
			const { path: editPath, to } = edit as { path?: unknown; to?: unknown };
			if (typeof editPath === "string") paths.push(editPath);
			if (typeof to === "string") paths.push(to);
			return paths;
		});
	}
	const rawPath = input.path ?? input.file_path;
	return typeof rawPath === "string" ? [rawPath] : [];
}

export default function primaryRoleMode(pi: ExtensionAPI): void {
	let currentRole: PrimaryRoleMode = "daedalus";
	let baselineTools: string[] | undefined;
	let latestMusePlanReady: MusePlanReadyMetadata | undefined;

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
			pi.setActiveTools(toolList);
		}
		if (ctx?.hasUI) {
			ctx.ui.setStatus(
				"primary-role-mode",
				currentRole === "daedalus" ? undefined : ctx.ui.theme.fg("accent", `role:${currentRole}`),
			);
		}
	}

	function ensureImplementationTools(ctx?: ExtensionContext | ExtensionCommandContext): void {
		const activeTools = new Set(pi.getActiveTools());
		for (const toolName of IMPLEMENTATION_HANDOFF_TOOLS) activeTools.add(toolName);
		pi.setActiveTools([...activeTools]);
	}

	async function handleMusePlanReady(
		event: { input: Record<string, unknown>; details: unknown },
		ctx: ExtensionContext,
	): Promise<void> {
		if (currentRole !== "muse") return;
		const planPath = event.input.path;
		if (typeof planPath !== "string" || !planPath.trim()) return;
		latestMusePlanReady = {
			path: planPath,
			sidecarPath: extractSidecarPath(event.details),
			validated: true,
			createdAt: new Date().toISOString(),
		};
		pi.appendEntry("muse-plan-ready", latestMusePlanReady);

		if (!ctx.hasUI || typeof ctx.ui.select !== "function") return;
		const choice = await ctx.ui.select(`Validated Muse plan: ${planPath}`, [...MUSE_PLAN_HANDOFF_OPTIONS]);
		if (choice !== "Implement with Daedalus") return;

		currentRole = "daedalus";
		applyRoleMode(ctx);
		ensureImplementationTools(ctx);
		baselineTools = pi.getActiveTools();
		persistRoleMode();
		pi.sendMessage(
			{
				customType: "muse-plan-handoff",
				content: `Validated plan ${planPath} is ready. Primary role switched to Daedalus for implementation.`,
				display: true,
				details: latestMusePlanReady,
			},
			{ triggerTurn: false },
		);
		pi.sendUserMessage(
			`Implement the validated plan at ${planPath}. Re-run plan_validate on ${planPath} before execute_plan, then use execute_plan with resume=true and delegate selected plan_task_read tasks to Worker subagents where appropriate.`,
			{ deliverAs: "followUp" },
		);
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

	async function switchPrimaryRole(requested: PrimaryRoleMode, ctx: ExtensionCommandContext): Promise<void> {
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
	}

	for (const role of ["sage", "muse", "daedalus"] as const) {
		pi.registerCommand(role, {
			description: `Switch primary role mode to ${PRIMARY_ROLE_LABELS[role]}`,
			handler: async (_args, ctx) => {
				await switchPrimaryRole(role, ctx);
			},
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		restoreFromSession(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreFromSession(ctx);
	});

	pi.on("tool_call", async (event, ctx) => {
		if (currentRole !== "muse" || !MUSE_WRITE_TOOLS.has(event.toolName)) {
			return undefined;
		}
		const paths = extractMutationPaths(event.toolName, event.input);
		const deniedPath = paths.find((toolPath) => !isMuseWritablePath(ctx.cwd, toolPath));
		if (!deniedPath) {
			return undefined;
		}
		return { block: true, reason: `Primary Muse may only write Markdown files; blocked ${deniedPath}` };
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "plan_validate" || event.isError) return undefined;
		await handleMusePlanReady(event, ctx);
		return undefined;
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
