import type { ExtensionAPI, ExtensionCommandContext } from "@daedalus-pi/coding-agent";
import { WorkspaceService } from "../../../../core/workspaces/workspace-service.js";

function notify(ctx: ExtensionCommandContext, message: string, type: "info" | "warning" | "error" = "info"): void {
	ctx.ui.notify(message, type);
}

function formatTarget(target: NonNullable<ExtensionCommandContext["workspaceTarget"]>): string {
	return [
		`cwd: ${target.cwd}`,
		`mode: ${target.isolationMode}`,
		target.id ? `id: ${target.id}` : undefined,
		target.branch ? `branch: ${target.branch}` : undefined,
		target.projectRoot ? `project: ${target.projectRoot}` : undefined,
	]
		.filter(Boolean)
		.join("\n");
}

function formatWorktreeList(entries: ReturnType<WorkspaceService["listWorktrees"]>): string {
	if (entries.length === 0) return "No git worktrees found";
	return entries
		.map((entry) => {
			const branch = entry.branch ?? (entry.detached ? "(detached)" : "(unknown)");
			const head = entry.head ? entry.head.slice(0, 12) : "unknown";
			return `${entry.path}\n  branch: ${branch}\n  head: ${head}`;
		})
		.join("\n");
}

export default function workspaceCommands(pi: ExtensionAPI) {
	pi.registerCommand("workspace", {
		description: "Workspace commands: /workspace status",
		handler: async (args, ctx) => {
			const [subcommand] = args.trim().split(/\s+/);
			if (!subcommand || subcommand === "status") {
				const target = ctx.getWorkspaceTarget?.() ?? ctx.workspaceTarget;
				if (!target) {
					notify(ctx, "No active workspace target", "warning");
					return;
				}
				notify(ctx, `Active workspace\n${formatTarget(target)}`);
				return;
			}
			notify(ctx, `Unknown workspace command: ${subcommand}`, "error");
		},
	});

	pi.registerCommand("worktree", {
		description:
			"Worktree commands: /worktree list, enter <id|branch|path>, create <branch> [base], exit, cleanup [--force]",
		handler: async (args, ctx) => {
			const [subcommand, ...rest] = args.trim().split(/\s+/).filter(Boolean);
			if (subcommand === "list") {
				const current = ctx.getWorkspaceTarget?.() ?? ctx.workspaceTarget;
				const projectRoot = current?.projectRoot ?? current?.repositoryRoot ?? current?.cwd;
				if (!projectRoot) {
					notify(ctx, "No workspace target or project root is available for listing worktrees", "warning");
					return;
				}
				try {
					const entries = new WorkspaceService({ projectRoot }).listWorktrees();
					notify(ctx, `Git worktrees\n${formatWorktreeList(entries)}`);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					notify(ctx, `Unable to list git worktrees for ${projectRoot}: ${message}`, "error");
				}
				return;
			}

			if (subcommand === "enter") {
				const target = rest.join(" ");
				if (!target) return notify(ctx, "Usage: /worktree enter <id|branch|path>", "error");
				if (!ctx.switchWorkspaceTarget) return notify(ctx, "Workspace switching is unavailable", "error");
				const input = target.startsWith("/") || target.startsWith(".") ? { cwd: target } : { branch: target };
				const result = await ctx.switchWorkspaceTarget(input);
				notify(ctx, `Entered workspace\n${formatTarget(result.workspaceTarget)}`);
				return;
			}
			if (subcommand === "create") {
				const branch = rest[0];
				if (!branch) return notify(ctx, "Usage: /worktree create <branch> [base-ref]", "error");
				if (!ctx.switchWorkspaceTarget) return notify(ctx, "Workspace switching is unavailable", "error");
				const result = await ctx.switchWorkspaceTarget({ mode: "create", branch, baseRef: rest[1] });
				notify(ctx, `Created workspace\n${formatTarget(result.workspaceTarget)}`);
				return;
			}
			if (subcommand === "exit") {
				const current = ctx.getWorkspaceTarget?.() ?? ctx.workspaceTarget;
				const projectRoot = current?.projectRoot;
				if (!projectRoot) return notify(ctx, "No base project root recorded for this workspace", "error");
				if (!ctx.switchWorkspaceTarget) return notify(ctx, "Workspace switching is unavailable", "error");
				const result = await ctx.switchWorkspaceTarget({ cwd: projectRoot });
				notify(ctx, `Exited workspace\n${formatTarget(result.workspaceTarget)}`);
				return;
			}
			if (subcommand === "cleanup") {
				const current = ctx.getWorkspaceTarget?.() ?? ctx.workspaceTarget;
				if (!current) return notify(ctx, "No active workspace target", "error");
				const force = rest.includes("--force");
				// Cleanup execution is intentionally delegated to core/runtime APIs when available in later surfaces.
				notify(
					ctx,
					`Cleanup requested for ${current.cwd}${force ? " (force)" : ""}. Use SDK/RPC cleanup risk before removal.`,
					"warning",
				);
				return;
			}
			notify(ctx, "Usage: /worktree list|enter|create|exit|cleanup", "error");
		},
	});
}
