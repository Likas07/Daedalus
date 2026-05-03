import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Type } from "@sinclair/typebox";
import {
	applyMergeBackPatch,
	captureMergeBackPatch,
	discardChildTarget,
	dryRunApplyMergeBack,
	inspectMergeBack,
	keepChildTarget,
} from "../../../core/workspaces/merge-back.js";
import type { WorkspaceTarget } from "../../../core/workspaces/types.js";

const TargetSchema = Type.Object({
	cwd: Type.String(),
	isolationMode: Type.Union([
		Type.Literal("shared_cwd"),
		Type.Literal("dedicated_worktree"),
		Type.Literal("external_worktree"),
		Type.Literal("detached"),
	]),
	branch: Type.Optional(Type.String()),
	baseBranch: Type.Optional(Type.String()),
	baseCommit: Type.Optional(Type.String()),
});

export default function subagentMergeBackTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "subagent_merge_back",
		label: "Subagent Merge Back",
		description:
			"Inspect, dry-run, apply, discard, or keep a subagent child workspace target. Uses core merge-back operations.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("inspect"),
				Type.Literal("capture_patch"),
				Type.Literal("dry_run"),
				Type.Literal("apply"),
				Type.Literal("discard"),
				Type.Literal("keep"),
			]),
			parent: Type.Optional(TargetSchema),
			child: TargetSchema,
			base_ref: Type.Optional(Type.String()),
			artifact_path: Type.Optional(Type.String()),
			force: Type.Optional(Type.Boolean()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const input = {
				parent: (params.parent ??
					ctx.workspaceTarget ?? { cwd: ctx.cwd, isolationMode: "shared_cwd" }) as WorkspaceTarget,
				child: params.child as WorkspaceTarget,
				baseRef: params.base_ref,
				artifactPath: params.artifact_path,
				force: params.force,
			};
			const result =
				params.action === "inspect"
					? inspectMergeBack(input)
					: params.action === "capture_patch"
						? await captureMergeBackPatch(input)
						: params.action === "dry_run"
							? await dryRunApplyMergeBack(input)
							: params.action === "apply"
								? await applyMergeBackPatch(input)
								: params.action === "discard"
									? discardChildTarget(input)
									: keepChildTarget(input);
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
		},
	});
}
